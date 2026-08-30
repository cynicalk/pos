/**
 * Multi-outlet rollup (MERGE_PLAN.md Phase 7).
 *
 * Pure: takes per-outlet aggregates that SQL already grouped, and assembles the
 * comparison table, the merged attention queue and the group totals.
 *
 * Two rules shape everything here.
 *
 * **This is never new maths.** Every figure is the same definition the outlet's
 * own page uses — cancellation rate from the same numerator and denominator,
 * food cost from lines with a costed recipe only, rating from the same reviews.
 * A group number that disagrees with the outlet number it summarises is worse
 * than no group page, because the operator has no way to tell which one lied.
 *
 * **A missing figure stays missing.** The source rolled up by summing, and a
 * sum treats "no data" as zero. An outlet that opened last week and has sold
 * nothing has no food-cost percentage; it does not have a food-cost percentage
 * of 0%, which would win every ranking on the page. Nulls propagate, averages
 * are taken over the outlets that actually reported, and the count of outlets
 * that could not answer is carried alongside so the operator sees the gap.
 */

// Ranking order for the merged queue, matching the actions engine's own.
const PRIORITY_RANK = { critical: 3, high: 2, medium: 1, low: 0 };

const num = (v) => (v === null || v === undefined ? null : Number(v));
const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);

/**
 * Average over the outlets that reported, never over all of them.
 *
 * Returns the count of contributors too, so the caller can say "4.3 across 3 of
 * 5 outlets" rather than presenting a partial average as a group figure.
 */
function averageOf(values) {
  const present = values.filter((v) => v !== null && Number.isFinite(v));
  if (!present.length) return { value: null, reporting: 0 };
  return {
    value: present.reduce((a, b) => a + b, 0) / present.length,
    reporting: present.length,
  };
}

/**
 * One row per outlet.
 *
 * @param {Array} outlets      [{ id, name, timezone }]
 * @param {object} metrics     maps keyed by outlet id, each possibly missing an
 *                             outlet entirely — a missing key means the outlet
 *                             produced no rows for that metric, which is not
 *                             the same as producing a zero.
 */
function buildComparison(outlets, metrics = {}) {
  const {
    orders = {}, ratings = {}, foodCost = {}, actions = {}, revenue = {},
    growth = {}, labour = {},
  } = metrics;

  return outlets.map((outlet) => {
    const o = orders[outlet.id];
    const r = ratings[outlet.id];
    const f = foodCost[outlet.id];
    const a = actions[outlet.id];
    const rev = revenue[outlet.id];
    const g = growth[outlet.id];
    const l = labour[outlet.id];

    const totalOrders = o ? Number(o.total_orders) : 0;
    const cancelled = o ? Number(o.cancelled_orders) : 0;

    const itemRevenue = f ? Number(f.item_revenue) : 0;
    const costed = f ? Number(f.items_costed) : 0;
    const itemsTotal = f ? Number(f.items_total) : 0;

    const revenueNum = rev ? Number(rev.revenue) : 0;

    // Same-store sales growth: this window against the prior window of equal
    // length. Null when there is no prior trade to grow from — a new outlet does
    // not have "0% growth", it has no comparison yet.
    const priorRevenue = g ? Number(g.prior_revenue) : 0;
    const currentRevenue = g ? Number(g.current_revenue) : 0;
    const salesGrowthPct = priorRevenue > 0
      ? Math.round(((currentRevenue - priorRevenue) / priorRevenue) * 1000) / 10
      : null;

    // Sales per labour hour. Null when no completed shifts were logged — an
    // outlet with no roster data has no productivity figure, not an infinite one.
    const labourHours = l ? Number(l.labour_hours) : 0;
    const salesPerLabourHour = labourHours > 0
      ? Math.round((revenueNum / labourHours) * 100) / 100
      : null;

    return {
      outletId: outlet.id,
      name: outlet.name,
      // Null, not zero: an outlet with no orders has no cancellation rate.
      cancellationPct: totalOrders > 0
        ? Math.round((cancelled / totalOrders) * 1000) / 10
        : null,
      orders: totalOrders,
      revenue: rev ? Math.round(Number(rev.revenue) * 100) / 100 : 0,
      // Only meaningful when something costed was actually sold.
      foodCostPct: itemRevenue > 0
        ? Math.round((Number(f.food_cost) / itemRevenue) * 1000) / 10
        : null,
      // What share of sold lines the percentage above is based on. Phase 3
      // established this: a food-cost figure without its coverage invites the
      // operator to read a partial menu as the whole one.
      foodCostCoveragePct: itemsTotal > 0
        ? Math.round((costed / itemsTotal) * 100)
        : null,
      avgRating: r ? round1(Number(r.avg_rating)) : null,
      reviewCount: r ? Number(r.review_count) : 0,
      openActions: a ? Number(a.open_actions) : 0,
      // Rupees this outlet's open actions quantify, computed by the SAME
      // estimateOpportunities the outlet's own Actions page uses — so the group
      // total is a sum of figures the operator can click through and verify.
      //
      // Today exactly one rule quantifies (high_cancellation, against real
      // cancelled-order revenue). Everything else is genuine risk with no
      // defensible number, contributes nothing here rather than a guess, and is
      // counted separately as `unquantifiedActions` so a small ₹ figure next to
      // eleven open findings reads as "we can only price two of these" instead
      // of "there is barely anything wrong".
      atStake: a ? Math.round(Number(a.at_stake || 0) * 100) / 100 : 0,
      unquantifiedActions: a ? Number(a.unquantified || 0) : 0,
      // Same-store sales growth and sales-per-labour-hour (Wave 2). Both null
      // rather than zero where the comparison or the roster is missing.
      salesGrowthPct,
      salesPerLabourHour,
      labourHours: Math.round(labourHours * 10) / 10,
    };
  });
}

/**
 * Group headline.
 *
 * Rates are averaged across outlets, NOT recomputed from group totals, and the
 * distinction matters: a group cancellation rate computed from pooled orders is
 * dominated by the busiest outlet, which hides the small site cancelling a
 * third of its orders. This page exists to find that site.
 */
function buildTotals(rows) {
  const cancellation = averageOf(rows.map((r) => r.cancellationPct));
  const foodCost = averageOf(rows.map((r) => r.foodCostPct));
  const rating = averageOf(rows.map((r) => r.avgRating));
  const growth = averageOf(rows.map((r) => r.salesGrowthPct));
  const splh = averageOf(rows.map((r) => r.salesPerLabourHour));

  return {
    outlets: rows.length,
    // Sums are honest here — money and counts genuinely add up.
    revenue: Math.round(rows.reduce((s, r) => s + r.revenue, 0) * 100) / 100,
    orders: rows.reduce((s, r) => s + r.orders, 0),
    openActions: rows.reduce((s, r) => s + r.openActions, 0),
    atStake: Math.round(rows.reduce((s, r) => s + r.atStake, 0) * 100) / 100,
    unquantifiedActions: rows.reduce((s, r) => s + r.unquantifiedActions, 0),
    // Averages carry how many outlets they cover.
    avgCancellationPct: round1(cancellation.value),
    cancellationReporting: cancellation.reporting,
    avgFoodCostPct: round1(foodCost.value),
    foodCostReporting: foodCost.reporting,
    avgRating: round1(rating.value),
    ratingReporting: rating.reporting,
    avgSalesGrowthPct: round1(growth.value),
    salesGrowthReporting: growth.reporting,
    avgSalesPerLabourHour: splh.value === null ? null : Math.round(splh.value * 100) / 100,
    splhReporting: splh.reporting,
  };
}

/**
 * The outlet that needs attention first.
 *
 * Ranked by open critical/high actions, then by rupees at stake. NOT by
 * revenue: the biggest outlet is not automatically the one with a problem, and
 * sorting by size would put the same name at the top every day until the page
 * stopped being read.
 */
function rankOutlets(rows, actionsByOutlet = {}) {
  return rows
    .map((row) => {
      const a = actionsByOutlet[row.outletId];
      return {
        ...row,
        urgentActions: a ? Number(a.urgent_actions || 0) : 0,
      };
    })
    .sort((a, b) => b.urgentActions - a.urgentActions
      || b.atStake - a.atStake
      || b.openActions - a.openActions
      || a.name.localeCompare(b.name));
}

/**
 * Every outlet's open findings in one list, worst first.
 *
 * Each item keeps the outlet it came from. A merged queue that loses the outlet
 * name is a list of problems nobody can be sent to fix.
 */
function mergeAttention(items = []) {
  return items
    .slice()
    .sort((a, b) => {
      const ar = a.amount === null || a.amount === undefined ? -1 : Number(a.amount);
      const br = b.amount === null || b.amount === undefined ? -1 : Number(b.amount);
      if (ar !== br) return br - ar;
      return (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
    })
    .map((item) => ({
      id: item.id,
      outletId: item.restaurant_id,
      outletName: item.outlet_name,
      title: item.title,
      description: item.description,
      priority: item.priority,
      ruleType: item.rule_type,
      // Null stays null. Phase 2 established that an action which cannot be
      // quantified reports no amount rather than zero.
      amount: item.amount === null || item.amount === undefined ? null : Number(item.amount),
      createdAt: item.created_at,
    }));
}

module.exports = {
  buildComparison,
  buildTotals,
  rankOutlets,
  mergeAttention,
  averageOf,
  PRIORITY_RANK,
};
