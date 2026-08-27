/**
 * Outcome tracking — ported from `src/modules/outcomes/tracker.ts`, kept pure.
 *
 * When an operator says they acted on a recommendation, the metric that rule
 * cares about is snapshotted ("before"). Later, once fresh data has arrived, the
 * same metric is re-measured ("after") and a verdict computed.
 *
 * Direction is tracked per metric rather than assumed: most improve when they
 * DROP (cancellation rate), a few improve when they RISE (average rating).
 * Getting this backwards would report every fixed problem as a regression.
 *
 * This is the piece the ops app called "the only thing that compounds" — it is
 * what turns a pile of advice into evidence about whether the advice worked.
 */

// Which metric each rule type is judged on. A rule absent from this map has no
// measurable outcome and is simply not tracked — better than inventing a proxy.
const METRIC_BY_RULE = {
  high_cancellation: { name: 'cancellation_pct', label: 'Cancellation rate %' },
  rating_drop:       { name: 'avg_rating',       label: 'Average rating' },
  // stalled_table is deliberately absent: it is a one-off nudge about a single
  // party, not a standing metric that a later measurement could compare against.
};

// Metrics where a HIGHER value is the improvement.
const HIGHER_IS_BETTER = new Set(['avg_rating']);

// Below this, a change is noise rather than a result.
const IMPROVEMENT_THRESHOLD_PCT = 5;

function metricForRuleType(ruleType) {
  return METRIC_BY_RULE[ruleType] || null;
}

/** Signed % change plus the verdict, honouring the metric's direction. */
function evaluateChange(before, after, metricName) {
  const denom = Math.abs(before) < 1e-9 ? 1 : Math.abs(before);
  const deltaPct = ((after - before) / denom) * 100;

  if (Math.abs(deltaPct) < IMPROVEMENT_THRESHOLD_PCT) {
    return { deltaPct, verdict: 'inconclusive' };
  }
  const improved = HIGHER_IS_BETTER.has(metricName) ? after > before : after < before;
  return { deltaPct, verdict: improved ? 'improved' : 'worsened' };
}

module.exports = {
  METRIC_BY_RULE,
  HIGHER_IS_BETTER,
  IMPROVEMENT_THRESHOLD_PCT,
  metricForRuleType,
  evaluateChange,
};
