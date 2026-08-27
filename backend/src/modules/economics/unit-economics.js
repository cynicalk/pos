/**
 * Unit Economics — ported from `src/modules/economics/unit-economics.ts`.
 *
 * The source built Cost Per Order almost entirely out of aggregator settlement
 * fields: platform commission, GST on that commission, TDS/TCS, and
 * platform-borne discounts. POS has none of those — there are no settlements
 * until Phase 8 — so reproducing that shape would mean reporting a cost per
 * order of zero for costs that are simply unmeasured.
 *
 * What POS does know is the operator's own side of the same equation: the
 * discounts they chose to give (manual, coupon, loyalty) and the food cost of
 * what was sold. Those are reported, and platform commission is named as
 * missing rather than silently treated as nil. This is the same discipline the
 * source applied to labour — "we report food cost and say plainly that labour
 * isn't tracked rather than invent the other half".
 */

// Indian QSR food cost sits around 30%; past 35% it is squeezing the margin.
const FOOD_COST_HEALTHY_PCT = 30;
const FOOD_COST_WATCH_PCT = 35;

function foodCostStatus(pct) {
  if (pct === null) return 'unknown';
  if (pct <= FOOD_COST_HEALTHY_PCT) return 'healthy';
  if (pct <= FOOD_COST_WATCH_PCT) return 'watch';
  return 'high';
}

/**
 * @param totals   { orders, revenue, subtotal, discount, coupon, loyalty, tax, serviceCharge }
 * @param cancels  { cancelledOrders, totalOrders, lostRevenue }
 * @param food     { foodCost, itemRevenue, itemsCosted, itemsTotal }
 */
function buildUnitEconomics({ totals, cancels, food, periodDays }) {
  const n = Number(totals.orders || 0);
  const per = (value) => (n > 0 ? Number(value) / n : 0);

  const discountsGiven =
    Number(totals.discount || 0) + Number(totals.coupon || 0) + Number(totals.loyalty || 0);
  const revenue = Number(totals.revenue || 0);
  const foodCost = Number(food.foodCost || 0);
  const itemRevenue = Number(food.itemRevenue || 0);

  // Only revenue whose cost is actually known contributes, so the ratio compares
  // like with like instead of dividing a known cost by an unknown revenue.
  const foodCostPct = itemRevenue > 0 ? (foodCost / itemRevenue) * 100 : null;

  const totalOrders = Number(cancels.totalOrders || 0);
  const cancelledOrders = Number(cancels.cancelledOrders || 0);
  const lostRevenue = Number(cancels.lostRevenue || 0);

  return {
    periodDays,

    cancellation: {
      cancelledOrders,
      totalOrders,
      cancellationPct: totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0,
      lostRevenue,
      avgLostPerCancellation: cancelledOrders > 0 ? lostRevenue / cancelledOrders : 0,
    },

    costPerOrder: {
      paidOrders: n,
      grossRevenue: revenue,
      avgOrderValue: per(revenue),
      // The operator's own marketing spend — every rupee they chose to give away.
      discountsPerOrder: per(discountsGiven),
      discountsTotal: discountsGiven,
      foodCostPerOrder: per(foodCost),
      // Deliberately NOT a "total cost per order": platform commission, GST on
      // commission and TDS/TCS are unmeasured until settlements land, so a total
      // would understate the real cost while looking authoritative.
      knownCostPerOrder: per(discountsGiven + foodCost),
      netPerOrder: per(revenue - discountsGiven - foodCost),
      // What the figures above cannot see. Rendered by the UI as a stated
      // limitation, not a footnote.
      excludes: ['platform commission', 'GST on commission', 'TDS/TCS', 'labour'],
    },

    foodCost: {
      foodCostPct,
      foodCost,
      itemRevenue,
      itemsCosted: Number(food.itemsCosted || 0),
      itemsTotal: Number(food.itemsTotal || 0),
      status: foodCostStatus(foodCostPct),
    },
  };
}

module.exports = {
  FOOD_COST_HEALTHY_PCT, FOOD_COST_WATCH_PCT, foodCostStatus, buildUnitEconomics,
};
