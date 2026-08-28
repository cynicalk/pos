const repo = require('./reputation.repository');
const themes = require('../modules/reputation/themes');
const summaryMod = require('../modules/reputation/summary');
const replyMod = require('../modules/reputation/reply');
const rankings = require('../modules/reputation/rankings');
const guests = require('../modules/guests/repeat');
const churn = require('../modules/guests/churn');
const llm = require('../ai/llm.client');
const { ValidationError, NotFoundError } = require('../shared/errors');

/*
 * Reputation service (MERGE_PLAN.md Phase 6).
 *
 * Holds the review classifier, the insights rollup, reply drafting, the
 * manually-recorded rankings, and the guest repeat/winback view. All the
 * arithmetic lives in src/modules/reputation/* and src/modules/guests/*; this
 * file fetches, calls them, and writes back.
 */

const DEFAULT_WINDOW_DAYS = 90;
const MAX_WINDOW_DAYS = 365;

// One classifier pass handles this many reviews. Capped because the model sees
// them in a single prompt: a hundred reviews in one request is where a 7B model
// starts losing its place and returning a list of the wrong length.
const CLASSIFY_BATCH = 25;

// Ceiling on any model call that a person is waiting behind, chosen to sit
// under the dashboard's 30s ceiling for these two actions so the fallback
// always wins the race. Past this the template is used instead — a usable
// draft the operator can edit beats a spinner that ends in an error.
const INTERACTIVE_MODEL_TIMEOUT_MS = 20_000;

// Platforms an operator can record a rank or a competitor rating against. A free
// text field here would produce "Swiggy", "swiggy" and "SWIGGY " as three
// separate tracked queries, which is how a rank tracker quietly stops tracking.
const PLATFORMS = ['swiggy', 'zomato', 'google', 'other'];

const clampWindow = (days) => {
  const n = parseInt(days, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WINDOW_DAYS;
  return Math.min(n, MAX_WINDOW_DAYS);
};

/* ── Classification ──────────────────────────────────────────────────────── */

/**
 * Ask the model to classify a batch.
 *
 * Returns null on any doubt — unreachable, unparseable, or a list of the wrong
 * length — and the caller falls back to keywords. A partial or misaligned list
 * is the dangerous case: themes would be silently attached to the wrong
 * reviews, and nothing downstream could tell.
 */
async function classifyWithModel(pending) {
  if (!(await llm.reachable(1500))) return null;

  const numbered = pending
    .map((r, i) => `${i + 1}. [${r.overall_rating}/5] ${r.comment || '(rating only, no comment)'}`)
    .join('\n');

  try {
    const { content } = await llm.chat([
      {
        role: 'system',
        content:
          'You classify restaurant guest feedback into exactly one theme each. '
          + `Themes: ${themes.REVIEW_THEMES.join(', ')}. `
          + 'Use "other" when the feedback names no specific theme, including when there is no '
          + 'comment at all — do not guess a theme from the rating. '
          + 'Reply with ONLY a JSON array of theme strings, one per numbered item, in order. '
          + 'The array must have exactly as many entries as there are items. No other text.',
      },
      { role: 'user', content: numbered },
    ], {
      temperature: 0,
      maxTokens: 512,
      retries: 1,
      timeoutMs: INTERACTIVE_MODEL_TIMEOUT_MS,
    });

    const match = String(content || '').match(/\[[\s\S]*\]/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length !== pending.length) return null;
    return parsed.map((t) => themes.normaliseTheme(String(t).trim().toLowerCase()));
  } catch {
    return null;
  }
}

/**
 * Classify pending reviews for one restaurant.
 *
 * Sentiment is always derived from the rating, whichever classifier ran — the
 * guest already stated how they felt, and a model is not entitled to overrule
 * them.
 *
 * `useModel` is off by default, and that default exists because of a real
 * failure: getInsights originally classified with the model before it
 * aggregated, so opening the Reviews page waited on a local 7B and, when
 * generation ran long, hung for the full 30-second timeout before rendering.
 *
 * Note what did NOT save us there — llm.reachable() returned true the whole
 * time. LM Studio answers /models instantly while generation is still queued
 * behind whatever else is on the GPU, so reachability says the endpoint exists,
 * not that it will answer in time. Anything on a request path a person is
 * waiting behind should use keywords; the model belongs to the scheduler and to
 * the explicit "Re-sort themes" button, where waiting is the point.
 */
async function classifyPending(restaurantId, { limit = CLASSIFY_BATCH, useModel = false } = {}) {
  const pending = await repo.listUnclassified(restaurantId, limit);
  if (!pending.length) return { classified: 0, via: null };

  const modelThemes = useModel ? await classifyWithModel(pending) : null;
  const via = modelThemes ? 'model' : 'keyword';

  let classified = 0;
  for (let i = 0; i < pending.length; i += 1) {
    const review = pending[i];
    const theme = modelThemes
      ? modelThemes[i]
      : themes.classifyByKeywords(review.comment);
    const written = await repo.setClassification(restaurantId, review.id, {
      theme,
      sentiment: themes.sentimentFromRating(review.overall_rating),
      classifiedBy: via,
    });
    if (written) classified += 1;
  }

  return { classified, via };
}

/** Fan-out for the scheduler. */
async function classifyAll() {
  const restaurantIds = await repo.restaurantsWithUnclassified();
  let total = 0;
  for (const id of restaurantIds) {
    // The scheduler is the right place for the model: nobody is waiting on it,
    // and it runs hourly rather than on every page load.
    const { classified } = await classifyPending(id, { useModel: true });
    total += classified;
  }
  return { restaurants: restaurantIds.length, classified: total };
}

/* ── Insights ────────────────────────────────────────────────────────────── */

/**
 * The single source for the Reviews insights tab and for Yumzy's
 * get_review_insights. One computation, so the page and the assistant cannot
 * quote different averages for the same reviews.
 */
async function getInsights(restaurantId, { days } = {}) {
  const windowDays = clampWindow(days);
  // Keyword-only, deliberately: this runs on a request someone is waiting
  // behind. It catches a review left five minutes ago instead of leaving it
  // uncounted until the next scheduler tick, and costs a few milliseconds.
  await classifyPending(restaurantId).catch(() => null);

  const rows = await repo.listForWindow(restaurantId, windowDays);
  const summary = summaryMod.summarizeReviews(rows);
  const actionQueue = summaryMod.buildActionQueue(summary);

  return {
    windowDays,
    summary,
    actionQueue,
    // Reviews that can actually be replied to. A review with no phone number is
    // feedback we can act on but not answer, and separating the two stops the
    // reply queue from being mostly dead ends.
    contactable: rows.filter((r) => r.customer_phone).length,
  };
}

/** Review rows with their draft state attached, for the reply queue. */
async function listReviews(restaurantId, { days } = {}) {
  const windowDays = clampWindow(days);
  const rows = await repo.listForWindow(restaurantId, windowDays);
  const replies = await repo.listReplies(restaurantId, rows.map((r) => r.id));
  const byReview = new Map(replies.map((r) => [r.review_id, r]));

  return rows.map((r) => {
    const reply = byReview.get(r.id);
    return {
      ...r,
      themeLabel: themes.THEME_LABELS[r.theme] || null,
      contactable: !!r.customer_phone,
      reply: reply
        ? {
          draft: reply.draft,
          source: reply.source,
          updatedAt: reply.updated_at,
          markedSentAt: reply.marked_sent_at,
        }
        : null,
    };
  });
}

/* ── Reply drafting ──────────────────────────────────────────────────────── */

/**
 * Draft a reply to one review.
 *
 * Refuses when the guest left no phone number. There is no public thread to
 * post to and no other route back to them, so a draft here would be a message
 * with nowhere to go — and an operator who sees a polished apology on screen
 * reasonably assumes it reached someone.
 */
async function draftReply(restaurantId, reviewId, userId) {
  const review = await repo.getById(restaurantId, reviewId);
  if (!review) throw new NotFoundError('Review not found');
  if (!review.customer_phone) {
    throw new ValidationError(
      'This guest left no phone number, so there is no way to send them a reply. '
      + 'POS reviews are private — there is no public thread to post under.',
    );
  }

  const restaurantName = await repo.getRestaurantName(restaurantId);
  const guestName = review.customer_name;
  const theme = review.theme || themes.classifyByKeywords(review.comment);

  const fallback = replyMod.templateReply({
    rating: review.overall_rating, theme, guestName, restaurantName,
  });

  // A rating with no comment gives a model nothing to be specific about, and
  // "specific" is the only thing it adds over the template. Skip the call.
  const hasComment = review.comment && String(review.comment).trim();
  let draft = fallback;
  let source = 'template';

  if (hasComment && await llm.reachable(1500)) {
    try {
      const { content } = await llm.chat([
        { role: 'system', content: replyMod.buildReplyPrompt({ restaurantName }) },
        {
          role: 'user',
          content: replyMod.buildReplyContext({
            rating: review.overall_rating,
            foodRating: review.food_rating,
            serviceRating: review.service_rating,
            theme,
            comment: review.comment,
            guestName,
          }),
        },
      ], {
        temperature: 0.4,
        maxTokens: 220,
        retries: 1,
        timeoutMs: INTERACTIVE_MODEL_TIMEOUT_MS,
      });

      const text = String(content || '').trim();
      if (text) {
        draft = text;
        source = 'model';
      }
    } catch {
      // Keep the template. A drafting failure is not worth failing the request
      // over when there is a usable draft in hand.
    }
  }

  const saved = await repo.upsertReply(restaurantId, reviewId, { draft, source, userId });
  return {
    reviewId,
    draft: saved.draft,
    source: saved.source,
    // Stated on every draft so the operator is never guessing whether the
    // system did something on their behalf. It did not, and cannot.
    delivery: 'manual',
    phone: review.customer_phone,
  };
}

/** Operator edited the draft themselves. */
async function saveReply(restaurantId, reviewId, draft, userId) {
  const text = String(draft || '').trim();
  if (!text) throw new ValidationError('Reply cannot be empty');
  if (text.length > 2000) throw new ValidationError('Reply is too long (max 2000 characters)');

  const review = await repo.getById(restaurantId, reviewId);
  if (!review) throw new NotFoundError('Review not found');

  const saved = await repo.upsertReply(restaurantId, reviewId, {
    draft: text, source: 'operator', userId,
  });
  return { reviewId, draft: saved.draft, source: saved.source };
}

/** Operator says they sent it. The system has no way to confirm that. */
async function markReplySent(restaurantId, reviewId, userId) {
  const saved = await repo.markReplySent(restaurantId, reviewId, userId);
  if (!saved) throw new NotFoundError('No draft to mark as sent');
  return { reviewId, markedSentAt: saved.marked_sent_at };
}

/* ── Rankings ────────────────────────────────────────────────────────────── */

async function getRankings(restaurantId) {
  const [rankRows, own, competitorRows] = await Promise.all([
    repo.listRanks(restaurantId),
    repo.getOwnRating(restaurantId),
    repo.listCompetitorRatings(restaurantId),
  ]);

  return {
    trackedQueries: rankings.buildTrackedQueries(rankRows),
    benchmark: rankings.buildBenchmark({
      ownRating: own?.avg_rating ?? null,
      ownReviewCount: own?.review_count ?? 0,
      competitorRows,
    }),
    platforms: PLATFORMS,
    maxComparableGapDays: rankings.MAX_COMPARABLE_GAP_DAYS,
    // Said out loud in the payload, not only in the UI copy: anything reading
    // this — including Yumzy — should know these figures were typed in.
    source: 'manual',
  };
}

function assertPlatform(platform) {
  if (!PLATFORMS.includes(platform)) {
    throw new ValidationError(`platform must be one of: ${PLATFORMS.join(', ')}`);
  }
}

async function recordRank(restaurantId, payload, userId) {
  const { platform, query, position, totalResults } = payload;
  assertPlatform(platform);

  const normalisedQuery = String(query || '').trim().toLowerCase();
  if (!normalisedQuery) throw new ValidationError('query is required');
  if (normalisedQuery.length > 120) throw new ValidationError('query is too long');

  const pos = parseInt(position, 10);
  if (!Number.isFinite(pos) || pos < 1) {
    throw new ValidationError('position must be 1 or higher');
  }

  let total = null;
  if (totalResults !== undefined && totalResults !== null && totalResults !== '') {
    total = parseInt(totalResults, 10);
    if (!Number.isFinite(total) || total < 1) {
      throw new ValidationError('total results must be 1 or higher');
    }
    if (total < pos) {
      throw new ValidationError('total results cannot be smaller than the position');
    }
  }

  return repo.insertRank(restaurantId, {
    platform, query: normalisedQuery, position: pos, totalResults: total, userId,
  });
}

async function deleteRank(restaurantId, id) {
  const removed = await repo.deleteRank(restaurantId, id);
  if (!removed) throw new NotFoundError('Rank reading not found');
  return { deleted: true };
}

async function recordCompetitorRating(restaurantId, payload, userId) {
  const { competitorName, platform, rating } = payload;
  assertPlatform(platform);

  const name = String(competitorName || '').trim();
  if (!name) throw new ValidationError('competitor name is required');
  if (name.length > 120) throw new ValidationError('competitor name is too long');

  const value = Number(rating);
  if (!Number.isFinite(value) || value < 0 || value > 5) {
    throw new ValidationError('rating must be between 0 and 5');
  }

  return repo.insertCompetitorRating(restaurantId, {
    competitorName: name, platform, rating: value.toFixed(1), userId,
  });
}

async function deleteCompetitorRating(restaurantId, id) {
  const removed = await repo.deleteCompetitorRating(restaurantId, id);
  if (!removed) throw new NotFoundError('Competitor rating not found');
  return { deleted: true };
}

/* ── Guests ──────────────────────────────────────────────────────────────── */

async function getGuestMetrics(restaurantId, { days } = {}) {
  const windowDays = clampWindow(days);
  const [rows, coverage] = await Promise.all([
    repo.getGuestRollup(restaurantId, windowDays),
    repo.getIdentificationCoverage(restaurantId, windowDays),
  ]);

  return guests.buildGuestMetrics(rows, {
    identifiedOrders: coverage?.identified_orders || 0,
    totalOrders:      coverage?.total_orders || 0,
    windowDays,
  });
}

/** How far back the churn view reads — long enough to include lapsed guests. */
const CHURN_WINDOW_DAYS = 365;

/**
 * Churn risk and reorder prediction from each guest's own visit cadence.
 */
async function getChurnRisk(restaurantId) {
  const rows = await repo.getGuestOrderHistory(restaurantId, CHURN_WINDOW_DAYS);
  const predictions = churn.buildChurnPredictions(
    rows.map((r) => ({
      customerId: r.customer_id,
      phone: r.phone,
      name: r.name,
      orderDates: r.order_dates,
      totalSpend: Number(r.total_spend),
    })),
  );
  return { ...predictions, windowDays: CHURN_WINDOW_DAYS };
}

/* ── Yumzy grounding ─────────────────────────────────────────────────────── */

/**
 * What the assistant is told about reputation.
 *
 * Deliberately narrow. It carries the review picture and the recorded rankings,
 * and it does not carry guest phone numbers or per-guest history — an assistant
 * that can be asked "what did Asha complain about" turns feedback into a
 * dossier, which is exactly the line the guest module refuses to cross.
 */
async function getSnapshot(restaurantId) {
  const [insights, ranks] = await Promise.all([
    getInsights(restaurantId),
    getRankings(restaurantId),
  ]);

  return {
    windowDays: insights.windowDays,
    reviews: {
      total: insights.summary.total,
      avgRating: insights.summary.avgRating,
      avgFood: insights.summary.avgFood,
      avgService: insights.summary.avgService,
      positive: insights.summary.positive,
      neutral: insights.summary.neutral,
      negative: insights.summary.negative,
      themes: insights.summary.themes.map((t) => ({
        theme: t.label, count: t.count, negative: t.negativeCount, avgRating: t.avgRating,
      })),
    },
    topComplaints: insights.actionQueue.slice(0, 3).map((a) => ({
      area: a.label,
      negativeReviews: a.negativeCount,
      ofTotal: a.totalCount,
      suggestedAction: a.suggestedAction,
    })),
    searchRankings: ranks.trackedQueries.map((q) => ({
      query: q.query,
      platform: q.platform,
      position: q.latestPosition,
      change: q.change,
      readings: q.readings,
      stale: q.stale,
    })),
    ratingBenchmark: {
      ownRating: ranks.benchmark.ownRating,
      competitors: ranks.benchmark.competitors.map((c) => ({
        name: c.competitorName, platform: c.platform, rating: c.rating, weAreAheadBy: c.delta,
      })),
    },
    notes: [
      'Search rankings and competitor ratings are typed in by hand by the operator. '
      + 'CookLyt does not read them from any platform, so they are only as current as the '
      + 'last time someone recorded one.',
      'Reviews here are first-party — left by guests at a table through CookLyt. They are '
      + 'not Swiggy, Zomato or Google reviews, and CookLyt cannot see those.',
    ],
  };
}

module.exports = {
  classifyPending,
  classifyAll,
  getInsights,
  listReviews,
  draftReply,
  saveReply,
  markReplySent,
  getRankings,
  recordRank,
  deleteRank,
  recordCompetitorRating,
  deleteCompetitorRating,
  getGuestMetrics,
  getChurnRisk,
  getSnapshot,
  PLATFORMS,
  DEFAULT_WINDOW_DAYS,
  CLASSIFY_BATCH,
};
