/**
 * Sales anomaly detection (MERGE_PLAN.md Phase 9).
 *
 * Deterministic, never AI — the same rule the rules engine follows: the maths
 * decides, and a model may only ever narrate it.
 *
 * Median + MAD (median absolute deviation), not mean + standard deviation.
 * Restaurant days are spiky: one festival Saturday inflates a standard
 * deviation enough to hide a genuinely bad Tuesday. MAD is robust to exactly
 * that.
 *
 * Pure — the caller supplies the daily series, which the POS already has from
 * Phase 0's `daily_snapshots`.
 *
 * Honesty guards carried over from the source:
 *   - Below MIN_BASELINE_DAYS of real trading it reports "not enough history"
 *     rather than guessing what normal looks like.
 *   - When MAD is 0 (every baseline day identical) it falls back to a
 *     percentage rule instead of dividing by zero and reporting a fake
 *     infinite score.
 *   - Days with no orders are real zeros and are kept in the judged window: a
 *     closed day IS the anomaly worth seeing. They are excluded from the
 *     BASELINE, though, because a stretch of zeros before the outlet opened is
 *     not evidence about today.
 *
 * And one the source did not have. See TODAY_IS_PARTIAL below.
 */

/** Below this many traded baseline days, we do not claim to know "normal". */
const MIN_BASELINE_DAYS = 14;

/** Modified z-score cut-off; 3.5 is the conventional threshold. */
const Z_THRESHOLD = 3.5;

/** Fallback when MAD is 0: flag a day deviating more than this share. */
const FLAT_BASELINE_PCT = 40;

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Judge the most recent days against the ones before them.
 *
 * @param {Array<{date: string, revenue: number}>} series  oldest first, gap-free,
 *        each date a local trading day (the snapshots table already does this).
 * @param {{recentDays?: number, today?: string}} options
 *
 * TODAY_IS_PARTIAL: `today` names the current trading day, and it is EXCLUDED
 * from judgement. The source judged it, which meant that from opening until
 * close every single day was flagged as a catastrophic revenue drop — because
 * a day that is half over has half its revenue. An alert that fires every
 * morning and resolves itself by midnight is worse than no alert: it trains the
 * operator to ignore the one that matters. Today stays in `series` so a chart
 * can draw it; it is simply not something we are willing to call unusual yet.
 */
function detectAnomalies(series = [], { recentDays = 7, today = null } = {}) {
  const judgeable = today
    ? series.filter((d) => d.date !== today)
    : series;

  const splitAt = Math.max(0, judgeable.length - recentDays);
  const baseline = judgeable.slice(0, splitAt);
  const recent = judgeable.slice(splitAt);

  // Only days the restaurant actually traded define normal.
  const baselineValues = baseline
    .filter((d) => Number(d.revenue) > 0)
    .map((d) => Number(d.revenue));

  if (baselineValues.length < MIN_BASELINE_DAYS) {
    return {
      hasBaseline: false,
      baselineDays: baselineValues.length,
      minBaselineDays: MIN_BASELINE_DAYS,
      normal: null,
      anomalies: [],
      judged: 0,
      todayExcluded: !!today,
      series,
    };
  }

  const normal = median(baselineValues);
  const mad = median(baselineValues.map((v) => Math.abs(v - normal)));

  const anomalies = [];
  for (const day of recent) {
    const revenue = Number(day.revenue);
    const diff = revenue - normal;
    const pctFromNormal = normal > 0 ? (diff / normal) * 100 : 0;

    let flagged = false;
    let score = null;

    if (mad > 0) {
      // 0.6745 scales MAD to be comparable with a standard deviation.
      score = (0.6745 * diff) / mad;
      flagged = Math.abs(score) >= Z_THRESHOLD;
    } else {
      flagged = Math.abs(pctFromNormal) >= FLAT_BASELINE_PCT;
    }

    if (flagged) {
      anomalies.push({
        date: day.date,
        revenue: round2(revenue),
        score: score === null ? null : round2(score),
        pctFromNormal: round2(pctFromNormal),
        direction: diff < 0 ? 'drop' : 'spike',
        // Carried so an alert can say what it is comparing against rather than
        // asserting a bare percentage.
        normal: round2(normal),
      });
    }
  }

  // Newest first, with a total order (localeCompare, not a two-way ternary —
  // the source's comparator never returned 0 for equal dates).
  anomalies.sort((a, b) => b.date.localeCompare(a.date));

  return {
    hasBaseline: true,
    baselineDays: baselineValues.length,
    minBaselineDays: MIN_BASELINE_DAYS,
    normal: round2(normal),
    anomalies,
    judged: recent.length,
    todayExcluded: !!today,
    series,
  };
}

module.exports = {
  MIN_BASELINE_DAYS,
  Z_THRESHOLD,
  FLAT_BASELINE_PCT,
  median,
  detectAnomalies,
};
