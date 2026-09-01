/**
 * Rules engine — ported from the ops back-office `src/modules/rules/engine.ts`.
 *
 * Restructured on the way across, per src/modules/README.md: the source
 * interleaved Prisma queries with the condition logic in one 522-line
 * `evaluateRules`. Here the evaluation is **pure** — it takes an already-fetched
 * context and returns candidate actions. Fetching lives in
 * actions.repository.js, persistence in actions.service.js.
 *
 * That split is why this file is testable without a database, and it is what
 * makes the thresholds arguable in a test rather than only observable in prod.
 *
 * The engine is deterministic on purpose. An LLM never decides whether
 * something is wrong — at most it words the message. That is the property that
 * makes an alert trustworthy enough to act on.
 */

// ── Rule catalogue ─────────────────────────────────────────────────────────
//
// Only rules whose data POS can actually supply today are seeded. The source
// ships ten; six of them read settlements, ingredient price history, search
// ranks or compliance records, none of which exist yet. Seeding a rule that can
// never fire would put a permanently silent row in the operator's rule list and
// make the engine look broken.
//
// Later phases add their own defaults and `seedRules` picks them up for
// existing installs, exactly as the source intended:
//   Phase 6 → rank_drop         (needs search_ranks)
//   Phase 8 → payout_variance, commission_overcharge (needs settlements)
//
// cost_spike joined in Phase 4 once ingredient_prices existed to compare
// against, license_expiry/cert_expiry in Phase 5 once compliance_docs did, and
// rank_drop in Phase 6 once search_ranks did, and revenue_anomaly in Phase 9
// once daily_snapshots had enough history behind it. The mechanism working
// exactly as designed.

const DEFAULT_RULES = [
  {
    ruleType: 'high_cancellation',
    condition: { field: 'cancellation_pct', op: '>', value: 10 },
    severity: 'medium',
    messageTemplate:
      'Cancellation rate of {cancellation_pct}% over the last {window_days} days. ' +
      '{cancel_count} of {total_count} orders were cancelled.',
  },
  {
    ruleType: 'rating_drop',
    condition: { field: 'avg_rating', op: '<', value: 4 },
    severity: 'medium',
    messageTemplate:
      'Average rating over the last {review_count} reviews is {avg_rating}. ' +
      'Lowest-scoring area: {weakest_area}.',
  },
  {
    // A recurring complaint THEME, not the average. rating_drop says the score
    // fell; this says what it fell about and what to do — one tracked action per
    // theme, gated by the same "two people, not one" floor the Reviews page uses.
    // No numeric condition: the pattern floor lives in buildActionQueue, so the
    // condition is a nominal presence check the evaluator does not read.
    ruleType: 'review_theme',
    condition: { field: 'negative_pattern', op: '>=', value: 2 },
    severity: 'medium',
    messageTemplate:
      '{negative_count} of {total_count} recent reviews about {label} were negative ' +
      '({negative_share}%). {suggested_action}',
  },
  {
    // Menu engineering, raised. The matrix already sorts dishes into stars /
    // plowhorses / puzzles / dogs by volume × margin; this turns the two
    // loss-leaning quadrants into tracked actions. No numeric condition — the
    // quadrant membership (a median split of THIS menu) is the gate.
    ruleType: 'menu_underperformer',
    condition: { field: 'menu_quadrant', op: 'in', value: 'plowhorse,dog' },
    severity: 'low',
    messageTemplate: '{name}: {detail}',
  },
  {
    // The reco→margin loop, raised. A high-margin puzzle the group recommender
    // rarely surfaces is money left on the table; this turns each into a "feature
    // it" action, and the outcome tracker then measures whether featuring raised
    // how often it's shown. Only fires when the recommender is actually active
    // (enough sessions saw picks) — otherwise "rarely shown" is just "no guests
    // yet", not a leak. No numeric condition; the gate is the puzzle membership
    // plus that it isn't already featured.
    ruleType: 'reco_underexposed',
    condition: { field: 'reco_impressions', op: '<', value: 1 },
    severity: 'low',
    messageTemplate: '{name}: {detail}',
  },
  {
    // Funnel-level, restaurant-wide: the recommender is verifiably steering carts
    // to low-margin dishes (its high-margin share is below the leak threshold).
    // One standing action, tracked by that share recovering.
    ruleType: 'reco_margin_leak',
    condition: { field: 'reco_high_margin_share', op: '<', value: 40 },
    severity: 'medium',
    messageTemplate:
      'The recommender is steering carts to low-margin dishes: only {high_margin_share}% '
      + 'of accepted picks are high-margin. Feature high-margin dishes to rebalance it.',
  },
  {
    // Acceptance fell week-over-week by more than the threshold, both windows
    // above the session floor. Tracked by acceptance recovering.
    ruleType: 'reco_acceptance_drop',
    condition: { field: 'acceptance_drop', op: '>=', value: 10 },
    severity: 'medium',
    messageTemplate:
      'Guests are accepting the picks less: acceptance fell from {prior_acceptance}% to '
      + '{acceptance}% ({acceptance_drop} points) versus the previous {window_days} days.',
  },
  {
    ruleType: 'rank_drop',
    // Three places, not one. Manual readings are taken at slightly different
    // times of day against a ranking that reshuffles constantly; a one-place
    // move is measurement noise and alerting on it teaches operators to ignore
    // the alert.
    condition: { field: 'positions_dropped', op: '>=', value: 3 },
    severity: 'medium',
    messageTemplate:
      'You were at position {previous_position} for "{query}" on {platform}, now '
      + '{latest_position} — {positions_dropped} places lower, measured {gap_days}.',
  },
  {
    ruleType: 'cost_spike',
    condition: { field: 'cost_increase_pct', op: '>', value: 15 },
    severity: 'medium',
    messageTemplate:
      '{ingredient} rose {cost_increase_pct}% — from {previous_cost} to {current_cost} per {unit}. ' +
      'Affects {dishes}.',
  },
  {
    ruleType: 'license_expiry',
    condition: { field: 'days_to_expiry', op: '<=', value: 60 },
    severity: 'high',
    messageTemplate:
      'FSSAI licence {number} expires in {days_to_expiry} days ({expiry_date}). ' +
      'Renewal routinely takes 30-60 days, so start now.',
  },
  {
    ruleType: 'cert_expiry',
    condition: { field: 'days_to_expiry', op: '<=', value: 60 },
    severity: 'medium',
    messageTemplate:
      "{holder}'s {cert_type} expires in {days_to_expiry} days ({expiry_date}).",
  },
  {
    ruleType: 'revenue_anomaly',
    // 25% below the median trading day. Deliberately not tighter: restaurant
    // days are spiky, and the MAD test upstream has already established the
    // day is statistically unusual — this threshold is the second, human
    // question of whether the gap is big enough to be worth a morning.
    condition: { field: 'pct_below_normal', op: '>=', value: 25 },
    severity: 'medium',
    messageTemplate:
      '{date} took {revenue} against a normal day of {normal} — {pct_below}% below, '
      + 'measured against the median of the last {baseline_days} trading days.',
  },
  {
    ruleType: 'stalled_table',
    condition: { field: 'minutes_seated', op: '>=', value: 25 },
    severity: 'medium',
    messageTemplate:
      'Table {table} has been seated {minutes_seated} minutes without ordering. Check on them.',
  },
  // ── Operator-intelligence rules (Wave 4) ────────────────────────────────
  // Turn the coupon / attach / service-charge findings into raised actions.
  {
    ruleType: 'coupon_loss',
    // 40% off gross is structurally heavy whatever the volume. Below this a code
    // is a normal promotion, not a leak worth a morning.
    condition: { field: 'discount_rate', op: '>=', value: 40 },
    severity: 'medium',
    messageTemplate:
      '{code} ran {orders} orders at {discount_rate}% off — you keep ₹{net_per_order} per order after the '
      + 'discount. Heavy discounting on a popular code is paying to be popular; consider a cap or a smaller offer.',
  },
  {
    ruleType: 'attach_drop',
    // A 0.03/order fall in a high-margin category — the "0.1 metric" slipping.
    condition: { field: 'attach_drop', op: '>=', value: 0.03 },
    severity: 'low',
    messageTemplate:
      '{category} per order fell to {attach} (was {prev_attach}) — down {drop} over the last {window_days} days. '
      + 'A high-margin add-on slipping quietly; a prompt or bundle can lift it back.',
  },
  {
    ruleType: 'sc_removal_high',
    condition: { field: 'removed_pct', op: '>=', value: 25 },
    severity: 'medium',
    messageTemplate:
      '{server} removed the service charge on {waived} of {applicable} bills ({removed_pct}%), against the '
      + 'outlet average of {outlet_pct}%. Worth a word — it is lost revenue and a service signal.',
  },
];

// Reviews needed before an average is worth alerting on. Below this a single
// bad night drags the mean under the threshold and the alert is noise.
const MIN_REVIEWS_FOR_RATING = 5;
const RATING_WINDOW = 10;
// A recurring THEME needs a wider lens than the rolling average does: two guests
// complaining about the same thing rarely land inside the last ten reviews, so
// the theme rule reads a larger recent window while rating_drop keeps its tight
// one. Recent, not all-time — the action centre is about what to fix now.
const REVIEW_THEME_WINDOW = 40;
const CANCELLATION_WINDOW_DAYS = 30;

// ── Primitives ─────────────────────────────────────────────────────────────

function evaluateCondition(value, condition) {
  switch (condition.op) {
    case '>':  return value >  condition.value;
    case '<':  return value <  condition.value;
    case '>=': return value >= condition.value;
    case '<=': return value <= condition.value;
    case '==': return value === condition.value;
    case '!=': return value !== condition.value;
    default:   return false;
  }
}

function interpolate(template, vars) {
  let result = template || '';
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }
  return result;
}

/** Human "1 h 5 m" / "40 m" for durations in an alert title. */
function formatMinutes(minutes) {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem} min`;
}

// ── Evaluators ─────────────────────────────────────────────────────────────
//
// Each takes the enabled rules plus the slice of context it needs, and returns
// candidate actions. A candidate is not yet an action: the service dedupes and
// persists.

/** Cancellation rate over the window. */
function evaluateCancellations(rules, { totalOrders, cancelledOrders }) {
  if (!totalOrders) return [];
  const pct = (cancelledOrders / totalOrders) * 100;

  return rules
    .filter((r) => r.rule_type === 'high_cancellation' && evaluateCondition(pct, r.condition))
    .map((rule) => ({
      ruleId: rule.id,
      ruleType: rule.rule_type,
      // The rate drifts with every order; one open alert is enough.
      dedupeKey: 'high_cancellation',
      title: `High cancellation rate — ${pct.toFixed(1)}%`,
      description: interpolate(rule.message_template, {
        cancellation_pct: pct.toFixed(1),
        cancel_count: cancelledOrders,
        total_count: totalOrders,
        window_days: CANCELLATION_WINDOW_DAYS,
      }),
      priority: rule.severity,
    }));
}

/**
 * Average of the recent reviews.
 *
 * The source named the top complaint *theme*, which came from an LLM
 * classification POS's `reviews` table does not have. Rather than drop the
 * detail or invent a theme, this names the weakest of the sub-scores the
 * operator's own guests actually filled in (food vs service). It is measured,
 * not inferred — and when neither sub-score was given it says so.
 */
function evaluateRatings(rules, { reviews }) {
  if (!reviews || reviews.length < MIN_REVIEWS_FOR_RATING) return [];

  const recent = reviews.slice(0, RATING_WINDOW);
  const avg = recent.reduce((sum, r) => sum + Number(r.overall_rating), 0) / recent.length;

  const mean = (key) => {
    const vals = recent.map((r) => r[key]).filter((v) => v != null).map(Number);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const food = mean('food_rating');
  const service = mean('service_rating');

  let weakestArea;
  if (food == null && service == null) weakestArea = 'not broken down by guests';
  else if (service == null) weakestArea = 'food';
  else if (food == null) weakestArea = 'service';
  else if (Math.abs(food - service) < 0.05) weakestArea = 'food and service equally';
  else weakestArea = food < service ? 'food' : 'service';

  return rules
    .filter((r) => r.rule_type === 'rating_drop' && evaluateCondition(avg, r.condition))
    .map((rule) => ({
      ruleId: rule.id,
      ruleType: rule.rule_type,
      dedupeKey: 'rating_drop',
      title: `Rating dipped to ${avg.toFixed(1)} — weakest on ${weakestArea}`,
      description: interpolate(rule.message_template, {
        avg_rating: avg.toFixed(1),
        review_count: recent.length,
        weakest_area: weakestArea,
      }),
      priority: rule.severity,
    }));
}

/**
 * Recurring complaint themes → one tracked action each.
 *
 * rating_drop already fires on the average; this is the complementary "what
 * about, and what to do" — it reuses the exact summarize + action-queue maths
 * the Reviews page shows, so the action centre and the page can never rank a
 * different complaint. Themes are keyword-classified as a deterministic floor
 * when the LLM classifier has not run yet, so this works without waiting on a
 * model; a review already classified keeps its stored theme.
 *
 * Priority is the theme's own risk, not a flat severity: hygiene is always high
 * (it is the complaint an inspector hears about), otherwise the share of the
 * theme that is negative decides. dedupeKey is per theme, so each recurring
 * complaint is its own trackable action and clears independently.
 */
function evaluateReviewThemes(rules, { reviewComments }) {
  const applicable = rules.filter((r) => r.rule_type === 'review_theme');
  if (!applicable.length || !reviewComments?.length) return [];

  const themes = require('../reputation/themes');
  const summaryMod = require('../reputation/summary');

  // Attach a theme/sentiment where the row has not been classified yet — the
  // keyword classifier and the rating are the honest deterministic floor.
  const classified = reviewComments.map((r) => ({
    ...r,
    theme: r.theme || themes.classifyByKeywords(r.comment),
    sentiment: r.sentiment || themes.sentimentFromRating(r.overall_rating),
  }));

  const queue = summaryMod.buildActionQueue(summaryMod.summarizeReviews(classified));
  if (!queue.length) return [];

  const priorityFor = (t) => {
    if (t.theme === 'hygiene') return 'high';
    if (t.negativeSharePct >= 50) return 'high';
    if (t.negativeSharePct >= 30) return 'medium';
    return 'low';
  };

  const out = [];
  for (const rule of applicable) {
    for (const t of queue) {
      out.push({
        ruleId: rule.id,
        ruleType: rule.rule_type,
        dedupeKey: `review_theme:${t.theme}`,
        title: `${t.negativeCount} guests flagged ${t.label.toLowerCase()}`,
        description: interpolate(rule.message_template, {
          negative_count: t.negativeCount,
          total_count: t.totalCount,
          label: t.label,
          negative_share: t.negativeSharePct,
          suggested_action: t.suggestedAction,
        }),
        priority: priorityFor(t),
      });
    }
  }
  return out;
}

/**
 * Menu underperformers → tracked actions, from the same quadrant the Menu
 * Insights page draws. Two of the four quadrants lose money:
 *   - plowhorses (high volume, thin margin) — a margin fix here pays off most,
 *     so they lead and rank medium; capped to the biggest sellers.
 *   - dogs (low volume, thin margin) — candidates to cut or rework; rank low,
 *     capped to the ones losing the most.
 * Per-dish dedupe so each is its own trackable action (and outcome).
 */
function evaluateMenuUnderperformers(rules, { menuMatrix }) {
  const applicable = rules.filter((r) => r.rule_type === 'menu_underperformer');
  if (!applicable.length || !menuMatrix) return [];

  const round1 = (n) => Math.round(Number(n) * 10) / 10;
  const MAX_PER_QUADRANT = 2;
  const plowhorses = [...(menuMatrix.plowhorses || [])].sort((a, b) => b.revenue - a.revenue).slice(0, MAX_PER_QUADRANT);
  const dogs = [...(menuMatrix.dogs || [])].sort((a, b) => a.profit - b.profit).slice(0, MAX_PER_QUADRANT);

  const out = [];
  for (const rule of applicable) {
    for (const d of plowhorses) {
      out.push({
        ruleId: rule.id,
        ruleType: rule.rule_type,
        dedupeKey: `menu_underperformer:plowhorse:${d.id}`,
        title: `${d.name} sells well but earns little`,
        description:
          `${d.name} sold ${d.totalSold} in this window at a ${round1(d.profitMargin)}% margin — below the menu ` +
          `median. Reprice it or bring the recipe cost down; a popular dish is where a margin fix pays off most.`,
        priority: 'medium',
      });
    }
    for (const d of dogs) {
      out.push({
        ruleId: rule.id,
        ruleType: rule.rule_type,
        dedupeKey: `menu_underperformer:dog:${d.id}`,
        title: `${d.name} barely sells and barely profits`,
        description:
          `${d.name} sold only ${d.totalSold} at a ${round1(d.profitMargin)}% margin. Consider removing it or ` +
          `reworking the recipe — it earns little and still takes menu space and prep attention.`,
        priority: 'low',
      });
    }
  }
  return out;
}

/**
 * High-margin puzzles the group recommender rarely puts in front of a table.
 *
 * The Recommendations page's reco→margin loop already identifies these; this
 * raises the most valuable few as tracked "feature it" actions so the operator is
 * nudged rather than having to open the page. Guarded on `recoActive` — the
 * funnel having enough sessions to mean anything — so a quiet week doesn't
 * mislabel "no guests" as "the recommender is hiding your best dishes". Already-
 * featured dishes drop out (the lever is pulled), which is also how the outcome
 * closes: featuring is the action, and its verdict is the dish's impressions rising.
 */
const RECO_UNDEREXPOSED_MAX = 3;
function evaluateRecoUnderexposed(rules, { recoPromote, recoActive }) {
  const applicable = rules.filter((r) => r.rule_type === 'reco_underexposed');
  if (!applicable.length || !recoActive || !Array.isArray(recoPromote)) return [];

  const round1 = (n) => Math.round(Number(n) * 10) / 10;
  const candidates = recoPromote
    .filter((p) => !p.featured && p.profitMargin != null)
    .sort((a, b) => b.profitMargin - a.profitMargin)
    .slice(0, RECO_UNDEREXPOSED_MAX);

  const out = [];
  for (const rule of applicable) {
    for (const p of candidates) {
      out.push({
        ruleId: rule.id,
        ruleType: rule.rule_type,
        dedupeKey: `reco_underexposed:${p.menuItemId}`,
        title: `${p.dishName} earns well but the picks rarely show it`,
        description:
          `${p.dishName} runs a ${round1(p.profitMargin)}% margin, yet the recommender put it in ` +
          `front of guests only ${p.impressions}× this window (${p.recoAdds} added). Feature it on ` +
          `the Recommendations page to push it into more tables' picks.`,
        priority: 'medium',
      });
    }
  }
  return out;
}

/**
 * Funnel-level reco health — two restaurant-wide signals, each gated on the
 * recommender actually being active so a quiet week never trips them:
 *   - margin leak: the aggregate high-margin share is below the leak threshold
 *     (the same verdict the Recommendations page shows).
 *   - acceptance drop: acceptance fell week-over-week past the threshold, and the
 *     funnel builder only supplies that delta when BOTH windows had enough
 *     sessions — so this can't fire on a thin prior window.
 */
const RECO_ACCEPTANCE_DROP_POINTS = 10;
function evaluateRecoHealth(rules, { recoFunnel, recoMargin, windowDays }) {
  if (!recoFunnel || !recoFunnel.enoughData) return [];
  const out = [];
  const round1 = (n) => Math.round(Number(n) * 10) / 10;

  for (const rule of rules.filter((r) => r.rule_type === 'reco_margin_leak')) {
    if (recoMargin && recoMargin.verdict === 'margin_leak' && recoMargin.highMarginShare != null) {
      out.push({
        ruleId: rule.id,
        ruleType: rule.rule_type,
        dedupeKey: 'reco_margin_leak',
        title: 'Your recommender is leaking margin',
        description:
          `Only ${round1(recoMargin.highMarginShare)}% of accepted picks are high-margin dishes; the rest `
          + 'are plowhorses — popular but thin. Feature high-margin dishes on the Recommendations page to '
          + 'rebalance what the picks push.',
        priority: 'medium',
      });
    }
  }

  for (const rule of rules.filter((r) => r.rule_type === 'reco_acceptance_drop')) {
    const drop = recoFunnel.acceptanceDelta;
    // Both a meaningful size AND statistical significance (two-proportion z-test,
    // computed in the funnel builder) — so a large-looking swing on thin volume
    // doesn't raise an action.
    if (drop != null && drop <= -RECO_ACCEPTANCE_DROP_POINTS && recoFunnel.acceptanceDropSignificant) {
      out.push({
        ruleId: rule.id,
        ruleType: rule.rule_type,
        dedupeKey: 'reco_acceptance_drop',
        title: 'Guests are accepting the picks less',
        description:
          `Acceptance fell from ${round1(recoFunnel.priorAcceptanceRate)}% to `
          + `${round1(recoFunnel.acceptanceRate)}% — ${round1(Math.abs(drop))} points lower than the previous `
          + `${windowDays || ''} days. Check whether a menu or availability change moved what the picks are.`,
        priority: 'medium',
      });
    }
  }
  return out;
}

/**
 * Tables seated past the threshold with nothing ordered.
 *
 * Keyed per occupancy (table id + the moment it was seated), so once the table
 * orders, is cleared, or is re-seated for a new party, the old alert cannot
 * re-fire and a genuinely new stall gets its own.
 *
 * Tables with no `occupied_at` are skipped, never assumed: POS only began
 * stamping that in migration 074, so a table occupied before then has no honest
 * seating time. Guessing one would produce a confident number about a party
 * that may have sat down two minutes ago.
 */
function evaluateStalledTables(rules, { seatedTables }, now = Date.now()) {
  const applicable = rules.filter((r) => r.rule_type === 'stalled_table');
  if (!applicable.length || !seatedTables?.length) return [];

  const candidates = [];
  for (const rule of applicable) {
    for (const t of seatedTables) {
      if (!t.occupied_at) continue;
      if (Number(t.open_order_count) > 0) continue;

      const minutesSeated = Math.floor((now - new Date(t.occupied_at).getTime()) / 60000);
      if (minutesSeated < 0) continue; // clock skew; never report a negative wait
      if (!evaluateCondition(minutesSeated, rule.condition)) continue;

      candidates.push({
        ruleId: rule.id,
        ruleType: rule.rule_type,
        dedupeKey: `stalled_table:${t.id}:${new Date(t.occupied_at).toISOString()}`,
        title: `Table ${t.number} seated ${formatMinutes(minutesSeated)} without ordering`,
        description: interpolate(rule.message_template, {
          table: t.number,
          minutes_seated: minutesSeated,
        }),
        priority: rule.severity,
      });
    }
  }
  return candidates;
}

/**
 * Ingredient prices that jumped between their last two recorded values.
 *
 * Keyed to the specific price row, so one jump alerts once and re-alerts only
 * if the price moves again. Dishes using the ingredient are named because
 * "tomatoes are up 22%" is information, while "tomatoes are up 22%, which hits
 * Butter Chicken and Margherita Pizza" is a decision.
 *
 * A first-ever price is never a spike: `priceChangePct` returns null without a
 * previous cost, and null is skipped rather than treated as a rise from zero.
 */
function evaluateCostSpikes(rules, { priceChanges }) {
  const applicable = rules.filter((r) => r.rule_type === 'cost_spike');
  if (!applicable.length || !priceChanges?.length) return [];

  const candidates = [];
  for (const rule of applicable) {
    for (const change of priceChanges) {
      const previous = Number(change.previous_cost);
      const current = Number(change.current_cost);
      if (!(previous > 0) || !Number.isFinite(current)) continue;

      const increasePct = ((current - previous) / previous) * 100;
      if (!evaluateCondition(increasePct, rule.condition)) continue;

      const dishes = change.dishes?.length
        ? change.dishes.join(', ')
        : 'no costed dish yet';

      candidates.push({
        ruleId: rule.id,
        ruleType: rule.rule_type,
        dedupeKey: `cost_spike:${change.ingredient_id}:${change.recorded_at}`,
        title: `${change.name} cost up ${increasePct.toFixed(1)}%`,
        description: interpolate(rule.message_template, {
          ingredient: change.name,
          cost_increase_pct: increasePct.toFixed(1),
          previous_cost: previous.toFixed(2),
          current_cost: current.toFixed(2),
          unit: change.unit,
          dishes,
        }),
        priority: rule.severity,
      });
    }
  }
  return candidates;
}

/**
 * All candidates for one restaurant, from an already-fetched context.
 * `now` is injectable so the time-dependent rule is testable without waiting.
 */
function buildCandidates(rules, context, now = Date.now()) {
  // Required here rather than at the top: expiries.js imports this module's
  // primitives, so a top-level require would be a cycle.
  const expiries = require('./expiries');
  const { evaluateRankDrop } = require('./rank-drop');
  const { evaluateRevenueAnomaly } = require('./anomaly-rule');
  const oi = require('./operator-intel');
  const enabled = rules.filter((r) => r.enabled);
  return [
    ...evaluateCancellations(enabled, context),
    ...evaluateRatings(enabled, context),
    ...evaluateReviewThemes(enabled, context),
    ...evaluateMenuUnderperformers(enabled, context),
    ...evaluateRecoUnderexposed(enabled, context),
    ...evaluateRecoHealth(enabled, context),
    ...evaluateStalledTables(enabled, context, now),
    ...evaluateCostSpikes(enabled, context),
    ...expiries.evaluateLicenceExpiry(enabled, context),
    ...expiries.evaluateCertExpiry(enabled, context),
    ...evaluateRankDrop(enabled, context),
    ...evaluateRevenueAnomaly(enabled, context),
    ...oi.evaluateCouponLoss(enabled, context),
    ...oi.evaluateAttachDrop(enabled, context),
    ...oi.evaluateScRemoval(enabled, context),
  ];
}

/**
 * Drop candidates whose condition is already unresolved, and collapse
 * duplicates within this run. Pure, so the dedupe rule is directly testable.
 */
function dedupeCandidates(candidates, openKeys = []) {
  const seen = new Set(openKeys);
  const out = [];
  for (const c of candidates) {
    if (seen.has(c.dedupeKey)) continue;
    seen.add(c.dedupeKey);
    out.push(c);
  }
  return out;
}

/** High and critical findings are alerts; everything else is a recommendation. */
const actionTypeFor = (priority) =>
  priority === 'high' || priority === 'critical' ? 'alert' : 'recommendation';

module.exports = {
  DEFAULT_RULES,
  MIN_REVIEWS_FOR_RATING,
  RATING_WINDOW,
  REVIEW_THEME_WINDOW,
  CANCELLATION_WINDOW_DAYS,
  evaluateCondition,
  interpolate,
  formatMinutes,
  evaluateCancellations,
  evaluateRatings,
  evaluateStalledTables,
  evaluateCostSpikes,
  buildCandidates,
  dedupeCandidates,
  actionTypeFor,
};
