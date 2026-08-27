/**
 * Search-rank drop evaluator (MERGE_PLAN.md Phase 6).
 *
 * Separate file for the same reason expiries.js is: engine.js was already long.
 * Same catalogue, same dedupe contract.
 *
 * This rule is unusual and the constraint is worth naming: it fires on data an
 * operator typed in by hand. It cannot notice a drop that nobody recorded, and
 * it must not treat two readings six weeks apart as a drop that "just
 * happened". buildTrackedQueries already refuses to call a wide gap a change —
 * `change` comes back null and this rule sees nothing — so the staleness rule
 * lives in one place and the alert inherits it.
 */

const { evaluateCondition, interpolate } = require('./engine');

/**
 * Positions lost since the previous reading, for queries where the two readings
 * are close enough together to compare.
 */
function evaluateRankDrop(rules, { trackedQueries } = {}) {
  const applicable = rules.filter((r) => r.rule_type === 'rank_drop');
  if (!applicable.length || !trackedQueries?.length) return [];

  const candidates = [];
  for (const rule of applicable) {
    for (const q of trackedQueries) {
      // change > 0 is an improvement; null means not comparable.
      if (q.change === null || q.change >= 0) continue;
      const dropped = Math.abs(q.change);
      if (!evaluateCondition(dropped, rule.condition)) continue;

      candidates.push({
        ruleId: rule.id,
        ruleType: rule.rule_type,
        // Keyed to the position landed on, not to the query alone: one alert
        // per new low. Recording the same bad position again is not news;
        // sliding further is.
        dedupeKey: `rank_drop:${q.platform}:${q.query}:${q.latestPosition}`,
        title: `"${q.query}" fell ${dropped} place${dropped === 1 ? '' : 's'} on ${q.platform}`,
        description: interpolate(rule.message_template, {
          query: q.query,
          platform: q.platform,
          positions_dropped: dropped,
          previous_position: q.previousPosition,
          latest_position: q.latestPosition,
          // Two readings taken the same day give gapDays 0, which rendered as
          // "measured 0 days apart" — a gap of no time. Caught on live output,
          // same defect as the Rankings page's "over 0d".
          gap_days: q.gapDays === 0 ? 'the same day' : `${q.gapDays} days apart`,
        }),
        // Falling out of the first page is a different problem from sliding
        // within it: below position 10 most guests never scroll to you.
        priority: q.latestPosition > 10 ? 'high' : rule.severity,
      });
    }
  }
  return candidates;
}

module.exports = { evaluateRankDrop };
