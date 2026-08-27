/**
 * Review aggregation and the action queue (MERGE_PLAN.md Phase 6).
 *
 * Pure: takes already-classified review rows, returns the shape both the
 * Reviews page and Yumzy read. One computation, so the page and the assistant
 * can never quote different averages for the same reviews.
 */

const { THEME_LABELS, SUGGESTED_ACTIONS, sentimentFromRating } = require('./themes');

// A pattern needs at least two people saying the same thing. Gated on the
// NEGATIVE count, not the theme's total: gating on the total let a single
// complaint inside a busy theme reach the queue ("1 of 14 reviews negative"),
// which contradicted the page's own promise that one bad review is a complaint
// and not a pattern. Caught on live output, and the same shape as the Phase 5
// "missed on 1 of the last 1" defect.
//
// The theme still appears in the summary — it happened — it just does not get
// ranked as something to go and fix. Same reasoning as MIN_REVIEWS_FOR_RATING
// in the rules engine.
const MIN_NEGATIVES_FOR_PATTERN = 2;

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * @param {Array<{overall_rating, food_rating, service_rating, comment, theme, sentiment, created_at}>} rows
 */
function summarizeReviews(rows = []) {
  if (!rows.length) {
    return {
      total: 0,
      avgRating: null,          // null, not 0: no reviews is not a rating of zero
      avgFood: null,
      avgService: null,
      withComment: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
      unclassified: 0,
      themes: [],
    };
  }

  const byTheme = new Map();
  let positive = 0;
  let neutral = 0;
  let negative = 0;
  let unclassified = 0;
  let withComment = 0;

  const foodRatings = [];
  const serviceRatings = [];
  let ratingSum = 0;

  for (const row of rows) {
    const rating = Number(row.overall_rating);
    ratingSum += rating;
    if (row.food_rating != null) foodRatings.push(Number(row.food_rating));
    if (row.service_rating != null) serviceRatings.push(Number(row.service_rating));
    if (row.comment && String(row.comment).trim()) withComment += 1;

    // Fall back to the rating when the row has not been classified yet, so a
    // freshly-arrived review still counts in the split rather than vanishing
    // from it. It is reported separately as `unclassified` so the operator can
    // see how much of the picture is still pending.
    const sentiment = row.sentiment || sentimentFromRating(rating);
    if (!row.sentiment) unclassified += 1;
    if (sentiment === 'positive') positive += 1;
    else if (sentiment === 'negative') negative += 1;
    else neutral += 1;

    const theme = row.theme || 'other';
    const entry = byTheme.get(theme) || {
      ratings: [], negativeCount: 0, worstExample: null, worstRating: 6, worstReviewId: null,
    };
    entry.ratings.push(rating);
    if (sentiment === 'negative') {
      entry.negativeCount += 1;
      // Strictly-less-than keeps the FIRST worst example when several share the
      // same rating, and rows arrive newest-first, so the example shown is the
      // most recent instance of the worst score rather than the oldest.
      if (rating < entry.worstRating && row.comment) {
        entry.worstRating = rating;
        entry.worstExample = row.comment;
        entry.worstReviewId = row.id || null;
      }
    }
    byTheme.set(theme, entry);
  }

  const avg = (arr) => (arr.length ? round1(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

  const themes = [...byTheme.entries()]
    .map(([theme, entry]) => ({
      theme,
      label: THEME_LABELS[theme] || theme,
      count: entry.ratings.length,
      negativeCount: entry.negativeCount,
      avgRating: avg(entry.ratings),
      worstExample: entry.worstExample,
      worstReviewId: entry.worstReviewId,
    }))
    .sort((a, b) => b.count - a.count || a.avgRating - b.avgRating);

  return {
    total: rows.length,
    avgRating: round1(ratingSum / rows.length),
    avgFood: avg(foodRatings),
    avgService: avg(serviceRatings),
    withComment,
    positive,
    neutral,
    negative,
    unclassified,
    themes,
  };
}

/**
 * The prioritised queue: themes with negative reviews, worst first.
 *
 * Ranked by negative COUNT rather than by average, because the question an
 * operator is answering here is "what is going wrong most often", and a single
 * 1-star outlier would otherwise outrank six 2-star complaints about the
 * same thing. Average breaks ties.
 */
function buildActionQueue(summary) {
  return summary.themes
    .filter((t) => t.negativeCount >= MIN_NEGATIVES_FOR_PATTERN)
    .sort((a, b) => b.negativeCount - a.negativeCount || a.avgRating - b.avgRating)
    .map((t) => ({
      theme: t.theme,
      label: t.label,
      negativeCount: t.negativeCount,
      totalCount: t.count,
      avgRating: t.avgRating,
      // Share of this theme's reviews that were negative — the number that says
      // whether the theme is a weak spot or just a busy one.
      negativeSharePct: Math.round((t.negativeCount / t.count) * 100),
      suggestedAction: SUGGESTED_ACTIONS[t.theme] || SUGGESTED_ACTIONS.other,
      worstExample: t.worstExample,
      worstReviewId: t.worstReviewId,
    }));
}

module.exports = { summarizeReviews, buildActionQueue, MIN_NEGATIVES_FOR_PATTERN };
