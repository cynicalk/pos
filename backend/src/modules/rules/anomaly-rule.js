/**
 * Revenue anomaly evaluator (MERGE_PLAN.md Phase 9).
 *
 * The last rule to join the catalogue, and the one that best shows why the
 * catalogue is worth having: the maths already existed as a pure module, so
 * wiring it into the engine is thirty lines and it inherits dedupe, cooldown,
 * severity and the outcome measurement that every other rule gets.
 *
 * Only DROPS raise an action. A spike is genuinely unusual and worth seeing on
 * a chart, but there is nothing for an operator to do about a good day at
 * 9 a.m. tomorrow, and an alert nobody acts on is an alert they stop reading.
 */

const { evaluateCondition, interpolate } = require('./engine');

function evaluateRevenueAnomaly(rules, { anomalies } = {}) {
  const applicable = rules.filter((r) => r.rule_type === 'revenue_anomaly');
  if (!applicable.length || !anomalies?.hasBaseline || !anomalies.anomalies.length) return [];

  const candidates = [];
  for (const rule of applicable) {
    for (const a of anomalies.anomalies) {
      if (a.direction !== 'drop') continue;
      // Condition is on the size of the shortfall, as a positive percentage.
      const shortfall = Math.abs(a.pctFromNormal);
      if (!evaluateCondition(shortfall, rule.condition)) continue;

      candidates.push({
        ruleId: rule.id,
        ruleType: rule.rule_type,
        // Keyed to the day, so one alert per unusual day however many
        // evaluation passes see it.
        dedupeKey: `revenue_anomaly:${a.date}`,
        title: `Revenue on ${a.date} was ${Math.round(shortfall)}% below normal`,
        description: interpolate(rule.message_template, {
          date: a.date,
          revenue: a.revenue,
          normal: a.normal,
          pct_below: Math.round(shortfall),
          baseline_days: anomalies.baselineDays,
        }),
        // A day at less than half of normal is a different problem from a
        // quiet Tuesday — usually something broke rather than something slowed.
        priority: shortfall >= 50 ? 'high' : rule.severity,
      });
    }
  }
  return candidates;
}

module.exports = { evaluateRevenueAnomaly };
