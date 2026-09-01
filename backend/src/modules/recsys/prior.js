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
 * The mean is taken over the dishes with enough exposure to be judged, and with
 * too few such dishes to form a baseline every lift is 0 — the model has learned
 * nothing yet and says so by doing nothing.
 *
 * Input: [{ menuItemId, impressions, adds, recentImpressions, recentAdds }].
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

function buildAcceptancePriors(activity = []) {
  const judged = activity
    .map((a) => ({ menuItemId: a.menuItemId, ...effective(a), rawImpressions: Number(a.impressions || 0) }))
    .filter((a) => a.rawImpressions >= MIN_IMPRESSIONS)
    // Wilson lower bound of the (recency-weighted) acceptance — the conservative
    // estimate a thin sample earns.
    .map((a) => ({ ...a, acceptance: wilsonLowerBound(a.adds, a.impressions) }));

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
