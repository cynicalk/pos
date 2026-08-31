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
  high_cancellation: { name: 'cancellation_pct',      label: 'Cancellation rate %' },
  rating_drop:       { name: 'avg_rating',            label: 'Average rating' },
  // The operator-intelligence findings. Most are per-ENTITY — the metric is that
  // one coupon's discount, that one category's attach, that one theme's complaint
  // share — so the entity is carried on the action's dedupe_key and read back at
  // measure time (see entityFromDedupeKey). sc_removal_high is restaurant-wide.
  sc_removal_high:   { name: 'sc_removed_pct',        label: 'Service charge removed %', perEntity: true },
  coupon_loss:       { name: 'coupon_discount_rate',  label: 'Coupon discount', perEntity: true },
  attach_drop:       { name: 'category_attach',       label: 'Category attach rate', perEntity: true },
  review_theme:      { name: 'review_theme_negshare', label: 'Complaint share %', perEntity: true },
  menu_underperformer: { name: 'menu_item_margin',    label: 'Dish margin %', perEntity: true },
  // stalled_table / revenue_anomaly / cost_spike / rank_drop are deliberately
  // absent: a one-off nudge or a single-day/ingredient/query event, not a standing
  // metric a later measurement could honestly compare against.
};

// Metrics where a HIGHER value is the improvement. Everything else improves when
// it drops (cancellations, service-charge removals, coupon give-away, complaints).
const HIGHER_IS_BETTER = new Set(['avg_rating', 'category_attach', 'menu_item_margin']);

// Below this, a change is noise rather than a result.
const IMPROVEMENT_THRESHOLD_PCT = 5;

function metricForRuleType(ruleType) {
  return METRIC_BY_RULE[ruleType] || null;
}

/**
 * The entity a per-entity finding is about, read from its dedupe_key. The engine
 * keys these as `<ruleType>:<entity>` (e.g. `coupon_loss:WELCOME50`,
 * `attach_drop:Desserts`, `review_theme:hygiene`), so the coupon code / category /
 * theme travels with the action and can be re-measured later. Restaurant-wide
 * metrics have no entity and return null.
 */
function entityFromDedupeKey(dedupeKey) {
  if (!dedupeKey) return null;
  const idx = String(dedupeKey).indexOf(':');
  return idx === -1 ? null : dedupeKey.slice(idx + 1) || null;
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
  entityFromDedupeKey,
  evaluateChange,
};
