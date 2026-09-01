/**
 * Small, dependency-free statistics for the recsys signals — the difference
 * between a number that looks confident and one that is.
 *
 * wilsonLowerBound: the lower end of a Wilson score interval for a binomial rate.
 * A dish added 6 of 12 times and one added 150 of 300 both point at 50%, but the
 * first could easily be 30% and the second is really near 50%. Using the lower
 * bound as the working estimate means a thin sample is treated conservatively —
 * it has to *earn* a high score with volume — which is exactly the abstention
 * discipline, expressed as a smooth curve instead of a hard cutoff.
 *
 * twoProportionZ: the z-statistic for "are these two rates really different", used
 * to decide whether a week-over-week acceptance move is signal or noise before it
 * raises an action. |z| >= 1.96 is the usual 95% bar.
 */

// Lower bound of the Wilson score interval. z defaults to 1.96 (95%).
function wilsonLowerBound(successes, trials, z = 1.96) {
  const n = Number(trials) || 0;
  if (n <= 0) return 0;
  const p = Math.max(0, Math.min(1, Number(successes) / n));
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.max(0, (centre - margin) / denom);
}

// Pooled two-proportion z-test. Returns { z, significant } (significant at 95%).
function twoProportionZ(s1, n1, s2, n2, z = 1.96) {
  const a1 = Number(n1) || 0;
  const a2 = Number(n2) || 0;
  if (a1 <= 0 || a2 <= 0) return { z: 0, significant: false };
  const p1 = Number(s1) / a1;
  const p2 = Number(s2) / a2;
  const pooled = (Number(s1) + Number(s2)) / (a1 + a2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a1 + 1 / a2));
  if (se === 0) return { z: 0, significant: false };
  const stat = (p1 - p2) / se;
  return { z: Math.round(stat * 100) / 100, significant: Math.abs(stat) >= z };
}

module.exports = { wilsonLowerBound, twoProportionZ };
