/**
 * Learned acceptance prior — the first thing the recommender learns from its own
 * logs, and an honest sliver of Recsys Phase 1 rather than the full learned
 * scorer.
 *
 * For each dish we have, from guest_events, how many tables it was SHOWN to and
 * how many ADDED it from a pick (distinct sessions, so quantity increments and
 * refine rounds don't double-count). Its acceptance drives a signed lift in
 * [-1, 1] the client multiplies its `learnedAcceptance` weight by.
 *
 * Two refinements over a raw ratio, both about not trusting thin data:
 *
 *   - **Wilson lower bound, not the point estimate.** A dish added 3 of 4 times
 *     reads 75%, but the interval is enormous; its Wilson lower bound is far
 *     lower. Using the lower bound means a dish has to earn a high acceptance with
 *     volume, so a lucky handful of adds can't rocket it up the ranking. This
 *     replaces a hard impression cutoff with a smooth confidence curve — the same
 *     abstention discipline, without the cliff.
 *
 *   - **Recency weighting.** Adds in the recent sub-window count double, so the
 *     prior tracks the current menu and mood rather than being anchored by a dish
 *     that was popular a month ago.
 *
 *   - **Position de-bias.** A dish shown at the top of the list is added because
 *     it's on top, not because it's the best fit — classic position bias. Using
 *     the logged average rank, an add from a deep slot is weighted up and one
 *     from the top slot down (a DCG-style examination curve), so the learned
 *     signal reflects the dish, not where it happened to sit. A dish with no rank
 *     history yet is left at neutral weight.
 *
 * The mean is taken over the dishes with enough exposure to be judged, and with
 * too few such dishes to form a baseline every lift is 0 — the model has learned
 * nothing yet and says so by doing nothing.
 *
 * Input: [{ menuItemId, impressions, adds, recentImpressions, recentAdds, avgRank }].
 * Output: Map menuItemId → lift in [-1, 1].
 */
const { wilsonLowerBound } = require('./stats');

const MIN_IMPRESSIONS = 5;        // a floor low enough that Wilson does the real work
const MIN_DISHES_FOR_BASELINE = 3; // need a few judged dishes to have a mean
const RECENCY_WEIGHT = 2;          // recent-window activity counts this many times
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Recency-weighted effective counts: recent activity (a subset of the window) is
// added again, so it weighs `RECENCY_WEIGHT`× the older tail. Both numerator and
// denominator are weighted the same way, so the ratio stays a rate.
function effective(a) {
  const impressions = Number(a.impressions || 0) + (RECENCY_WEIGHT - 1) * Number(a.recentImpressions || 0);
  const adds = Number(a.adds || 0) + (RECENCY_WEIGHT - 1) * Number(a.recentAdds || 0);
  return { impressions, adds };
}

// Position de-bias factor from a dish's average shown rank. A DCG-style
// examination curve: rank 1 ≈ 1.0 (no boost), deeper ranks > 1 (adds there are
// harder-won, so worth more). Clamped so a single deep placement can't explode
// the signal, and neutral (1.0) when there's no rank history yet.
function positionFactor(avgRank) {
  const r = Number(avgRank);
  if (!Number.isFinite(r) || r < 1) return 1;
  return Math.min(2, Math.log2(r + 1)); // rank1→1.0, rank3→2.0(capped), rank5→2.0
}

function buildAcceptancePriors(activity = []) {
  const judged = activity
    .map((a) => ({ menuItemId: a.menuItemId, ...effective(a), rawImpressions: Number(a.impressions || 0), avgRank: a.avgRank }))
    .filter((a) => a.rawImpressions >= MIN_IMPRESSIONS)
    // Wilson lower bound of the (recency-weighted) acceptance, then de-biased for
    // the slot it was shown at — the conservative estimate a thin sample earns,
    // adjusted for position so the top slot doesn't flatter a mediocre dish.
    .map((a) => ({ ...a, acceptance: wilsonLowerBound(a.adds, a.impressions) * positionFactor(a.avgRank) }));

  const priors = new Map();
  if (judged.length < MIN_DISHES_FOR_BASELINE) return priors; // nothing learned yet

  const mean = judged.reduce((s, a) => s + a.acceptance, 0) / judged.length;
  if (mean <= 0) return priors; // no confident adds anywhere → no signal to lift on

  for (const a of judged) {
    const lift = clamp((a.acceptance - mean) / mean, -1, 1);
    priors.set(a.menuItemId, Math.round(lift * 1000) / 1000);
  }
  return priors;
}

module.exports = { buildAcceptancePriors, MIN_IMPRESSIONS, MIN_DISHES_FOR_BASELINE, RECENCY_WEIGHT };
