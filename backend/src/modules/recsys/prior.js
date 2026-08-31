/**
 * Learned acceptance prior — the first thing the recommender learns from its own
 * logs, and an honest sliver of Recsys Phase 1 rather than the full learned
 * scorer.
 *
 * For each dish we have, from guest_events, how often it was SHOWN and how often
 * it was ADDED from a pick. Its acceptance = added ÷ shown. A dish accepted more
 * than the menu's average (over the dishes with enough impressions to judge) is
 * one guests actually take when offered; it earns a positive nudge in the
 * recommender's ranking, and one accepted less earns a negative one. The result
 * is a signed lift in [-1, 1] the client multiplies its `learnedAcceptance`
 * weight by.
 *
 * The discipline the whole recsys work keeps applies here too:
 *   - A dish shown fewer than the floor has NO acceptance we can trust, so its
 *     lift is 0 (the hand-tuned model decides it, unchanged) — never a rate off
 *     three impressions dressed up as learning.
 *   - The mean is taken over the dishes that cleared the floor, not all dishes,
 *     so a menu where only two dishes have data doesn't anchor the baseline to
 *     zeros.
 *   - With too few dishes above the floor to form a baseline at all, every lift
 *     is 0 — the model has learned nothing yet and says so by doing nothing.
 *
 * Input: [{ menuItemId, impressions, adds }].
 * Output: Map menuItemId → lift in [-1, 1].
 */

const MIN_IMPRESSIONS = 12;      // below this a dish's acceptance is noise
const MIN_DISHES_FOR_BASELINE = 3; // need a few judged dishes to have a mean
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function buildAcceptancePriors(activity = []) {
  const judged = activity
    .map((a) => ({
      menuItemId: a.menuItemId,
      impressions: Number(a.impressions || 0),
      adds: Number(a.adds || 0),
    }))
    .filter((a) => a.impressions >= MIN_IMPRESSIONS)
    .map((a) => ({ ...a, acceptance: a.adds / a.impressions }));

  const priors = new Map();
  if (judged.length < MIN_DISHES_FOR_BASELINE) return priors; // nothing learned yet

  const mean = judged.reduce((s, a) => s + a.acceptance, 0) / judged.length;
  if (mean <= 0) return priors; // no adds anywhere → no signal to lift on

  for (const a of judged) {
    // Relative to the menu's own average acceptance, clamped so one runaway dish
    // can't dominate. +1 ≈ double the average, -1 ≈ nothing accepted.
    const lift = clamp((a.acceptance - mean) / mean, -1, 1);
    priors.set(a.menuItemId, Math.round(lift * 1000) / 1000);
  }
  return priors;
}

module.exports = { buildAcceptancePriors, MIN_IMPRESSIONS, MIN_DISHES_FOR_BASELINE };
