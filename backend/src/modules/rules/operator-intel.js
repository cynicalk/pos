/**
 * Operator-intelligence rules — the Wave 1–3 findings turned into raised actions.
 *
 * These read the same computed figures the Economics / Menu Insights / Group
 * pages show, so an action can never disagree with the screen it came from. Each
 * is deterministic: the engine decides *whether* something is worth a nudge; only
 * the wording is ever a template. Kept pure — thresholds are arguable in a test.
 */

const { evaluateCondition, interpolate } = require('./engine');

// Below these a finding is noise: a code with a handful of redemptions, or a
// server with too few bills to read a rate off.
const MIN_COUPON_ORDERS = 8;
const MIN_SC_BILLS = 10;

/**
 * A coupon giving away a heavy share of gross on real volume — "paying to be
 * popular." The threshold (the discount rate) lives on the rule; this supplies
 * the code's measured figures and abstains on codes too small to matter.
 */
function evaluateCouponLoss(rules, { couponEconomics } = {}) {
  const applicable = rules.filter((r) => r.rule_type === 'coupon_loss');
  if (!applicable.length || !couponEconomics?.codes?.length) return [];

  const out = [];
  for (const rule of applicable) {
    for (const c of couponEconomics.codes) {
      if (!c || c.orders < MIN_COUPON_ORDERS || c.netPerOrder == null) continue;
      const pct = Math.round(c.discountRate * 100);
      if (!evaluateCondition(pct, rule.condition)) continue;
      out.push({
        ruleId: rule.id,
        ruleType: rule.rule_type,
        dedupeKey: `coupon_loss:${c.code}`,
        title: `${c.code} gives away ${pct}% on ${c.orders} orders`,
        description: interpolate(rule.message_template, {
          code: c.code,
          orders: c.orders,
          discount_rate: pct,
          net_per_order: c.netPerOrder,
          discount_per_order: c.discountPerOrder,
        }),
        priority: rule.severity,
      });
    }
  }
  return out;
}

/**
 * A high-margin category whose items-per-order fell against the prior window.
 * Only fires on the categories tagged high-margin (drinks, desserts) and only
 * when there was a prior window to compare against — no prior, no drop.
 */
function evaluateAttachDrop(rules, { attach, windowDays = 30 } = {}) {
  const applicable = rules.filter((r) => r.rule_type === 'attach_drop');
  if (!applicable.length || !attach?.categories?.length) return [];

  const out = [];
  for (const rule of applicable) {
    for (const c of attach.categories) {
      if (!c.highMargin || c.delta == null || c.delta >= 0) continue;
      const dropMag = Math.round(-c.delta * 1000) / 1000;
      if (!evaluateCondition(dropMag, rule.condition)) continue;
      out.push({
        ruleId: rule.id,
        ruleType: rule.rule_type,
        dedupeKey: `attach_drop:${c.category}`,
        title: `${c.category} per order down ${dropMag.toFixed(2)}`,
        description: interpolate(rule.message_template, {
          category: c.category,
          attach: c.attach.toFixed(2),
          prev_attach: c.prevAttach.toFixed(2),
          drop: dropMag.toFixed(2),
          window_days: windowDays,
        }),
        priority: rule.severity,
      });
    }
  }
  return out;
}

/**
 * A server removing the service charge on an outsized share of their bills.
 * Needs enough bills to judge, and reports the outlet rate alongside so the
 * number reads as "well above the floor", not an isolated figure.
 */
function evaluateScRemoval(rules, { scRemoved } = {}) {
  const applicable = rules.filter((r) => r.rule_type === 'sc_removal_high');
  if (!applicable.length || !scRemoved?.servers?.length) return [];

  const outletPct = scRemoved.removedPct;
  const out = [];
  for (const rule of applicable) {
    for (const s of scRemoved.servers) {
      if (s.applicable < MIN_SC_BILLS || s.removedPct == null) continue;
      if (!evaluateCondition(s.removedPct, rule.condition)) continue;
      out.push({
        ruleId: rule.id,
        ruleType: rule.rule_type,
        dedupeKey: `sc_removal_high:${s.server}`,
        title: `${s.server} removes service charge on ${s.removedPct}% of bills`,
        description: interpolate(rule.message_template, {
          server: s.server,
          waived: s.waived,
          applicable: s.applicable,
          removed_pct: s.removedPct,
          outlet_pct: outletPct == null ? '—' : outletPct,
        }),
        priority: rule.severity,
      });
    }
  }
  return out;
}

module.exports = {
  evaluateCouponLoss,
  evaluateAttachDrop,
  evaluateScRemoval,
  MIN_COUPON_ORDERS,
  MIN_SC_BILLS,
};
