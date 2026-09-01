const repo = require('./insights.repository');
const perf = require('../modules/menu/performance');
const crossSell = require('../modules/menu/cross-sell');
const newItems = require('../modules/menu/new-items');
const hours = require('../modules/dinein/hours');
const economics = require('../modules/economics/unit-economics');
const couponEconomics = require('../modules/economics/coupon-economics');
const attachRate = require('../modules/menu/attach-rate');
const recsysFunnel = require('../modules/recsys/funnel');
const recsysMargin = require('../modules/recsys/margin');
const recsysAnalytics = require('../modules/recsys/analytics');
const staffPerformance = require('../modules/staff/performance');
const cohorts = require('../modules/reputation/cohorts');
const { createTtlCache } = require('../shared/ttl-cache');

const recoCache = createTtlCache();
const RECO_CACHE_TTL_MS = 60_000; // a minute is well inside "guests ordering" pace
// Cohorts move at the pace of days, not requests, and their query is the heaviest
// (historical). A longer cache keeps the page snappy without staleness anyone notices.
const slowCache = createTtlCache();
const SLOW_CACHE_TTL_MS = 5 * 60_000;
const COHORT_WINDOW_MONTHS = 24;
const billingMetrics = require('../modules/economics/billing-metrics');
const labourHours = require('../modules/labour/hours');
const labourService = require('../labour/labour.service');
const { validateTimezone } = require('../shared/timezone');
const { ValidationError } = require('../shared/errors');

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

function parseDays(raw, fallback = DEFAULT_DAYS) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) {
    throw new ValidationError(`days must be a whole number between 1 and ${MAX_DAYS}`);
  }
  return n;
}

const tzFor = async (restaurantId) =>
  validateTimezone(await repo.getTimezone(restaurantId), 'UTC');

/** Menu engineering: per-dish performance plus the four quadrants. */
async function getMenuInsights(restaurantId, daysRaw) {
  const days = parseDays(daysRaw);
  const tz = await tzFor(restaurantId);
  const [rows, spanDays] = await Promise.all([
    repo.getMenuPerformance(restaurantId, days),
    repo.getSpanDays(restaurantId, tz, days),
  ]);

  const performance = perf.buildPerformance(rows, { spanDays });
  return { days, spanDays, performance, matrix: perf.buildMatrix(performance) };
}

async function getCrossSell(restaurantId, daysRaw, limit = 8) {
  const days = parseDays(daysRaw);
  const lines = await repo.getBasketLines(restaurantId, days);
  return { days, ...crossSell.buildCrossSellMap(lines, limit) };
}

async function getNewItems(restaurantId, daysRaw) {
  const windowDays = parseDays(daysRaw, newItems.NEW_ITEM_WINDOW_DAYS);
  const tz = await tzFor(restaurantId);

  const [items, quantities, spanDays] = await Promise.all([
    repo.getNewItems(restaurantId, windowDays),
    repo.getAllItemQuantities(restaurantId, windowDays),
    repo.getSpanDays(restaurantId, tz, windowDays),
  ]);

  const menuMedianDaily = newItems.medianDailyRate(quantities, spanDays);
  return {
    windowDays,
    menuMedianDaily,
    items: newItems.buildNewItemPerformance(items, menuMedianDaily),
  };
}

async function getServiceHours(restaurantId, daysRaw, channel = null) {
  const days = parseDays(daysRaw);
  const tz = await tzFor(restaurantId);
  const [buckets, daysObserved] = await Promise.all([
    repo.getHourBuckets(restaurantId, tz, days, channel || null),
    repo.getSpanDays(restaurantId, tz, days),
  ]);
  return { days, timezone: tz, ...hours.buildServiceHours(buckets, daysObserved) };
}

async function getEconomics(restaurantId, daysRaw) {
  const periodDays = parseDays(daysRaw);
  const [totals, cancels, food] = await Promise.all([
    repo.getEconomicsTotals(restaurantId, periodDays),
    repo.getCancellationTotals(restaurantId, periodDays),
    repo.getFoodCostTotals(restaurantId, periodDays),
  ]);

  const base = economics.buildUnitEconomics({
    periodDays,
    totals,
    cancels: {
      totalOrders: cancels.total_orders,
      cancelledOrders: cancels.cancelled_orders,
      lostRevenue: cancels.lost_revenue,
    },
    food: {
      foodCost: food.food_cost,
      itemRevenue: food.item_revenue,
      itemsCosted: food.items_costed,
      itemsTotal: food.items_total,
    },
  });

  // Labour, and with it the full prime cost (Phase 4). Until shifts are logged
  // this reports the halves and says the total isn't available — a prime cost
  // quoted without labour flatters the operator by exactly what they pay staff.
  const revenue = Number(totals.revenue || 0);
  const labour = await labourService.getLabourTotals(restaurantId, periodDays, revenue);
  const hasFoodCost = base.foodCost.foodCostPct !== null;
  const hasLabour = labour.totalHours > 0;
  const primeCost = labourHours.computePrimeCost({
    foodCost: base.foodCost.foodCost,
    labourCost: labour.labourCost,
    revenue,
    hasFoodCost,
    hasLabour,
  });

  // Delivery platform take — countable now that settlements land, closing the
  // last cost the economics page previously only named. Coverage travels with
  // it so a partial reconciliation cannot flatter the margin.
  const [deliveryTotals, deliveryOrders] = await Promise.all([
    repo.getDeliveryCostTotals(restaurantId, periodDays),
    repo.getDeliveryOrderCount(restaurantId, periodDays),
  ]);
  const reconciledOrders = Number(deliveryTotals.reconciled_orders || 0);
  const delivery = {
    commission: Number(deliveryTotals.commission || 0),
    taxesWithheld: Number(deliveryTotals.taxes_withheld || 0),
    penalties: Number(deliveryTotals.penalties || 0),
    platformTake: Number(deliveryTotals.platform_take || 0),
    gross: Number(deliveryTotals.gross || 0),
    reconciledOrders,
    deliveryOrders: Number(deliveryOrders || 0),
    coveragePct: deliveryOrders > 0 ? Math.round((reconciledOrders / deliveryOrders) * 100) : null,
  };
  const operatingMargin = labourHours.computeOperatingMargin({
    revenue,
    foodCost: base.foodCost.foodCost,
    labourCost: labour.labourCost,
    deliveryCost: delivery.platformTake,
    hasFoodCost,
    hasLabour,
    hasDelivery: reconciledOrders > 0,
  });

  // Wave 3 — per-cover and service-charge-removed, from the billing capture. Both
  // abstain until the flow has recorded a guest count / a service charge to remove.
  const [apcRow, scRow, scByServer, scRate] = await Promise.all([
    repo.getApc(restaurantId, periodDays),
    repo.getScRemoved(restaurantId, periodDays),
    repo.getScRemovedByServer(restaurantId, periodDays),
    repo.getServiceChargeRate(restaurantId),
  ]);
  const apc = billingMetrics.buildApc(apcRow);
  const scRemoved = billingMetrics.buildScRemoved(scRow, scByServer, { scRate });

  return { ...base, labour, primeCost, delivery, operatingMargin, apc, scRemoved };
}

/** Coupon contribution: net revenue kept per code, after discount and delivery commission. */
async function getCouponEconomics(restaurantId, daysRaw) {
  const days = parseDays(daysRaw);
  const [rows, commissionRate] = await Promise.all([
    repo.getCouponEconomics(restaurantId, days),
    repo.getAvgCommissionRate(restaurantId),
  ]);
  return { days, commissionRate, ...couponEconomics.buildCouponEconomics(rows, { commissionRate }) };
}

/** Category attach rate (items per order) vs the prior equal-length window. */
async function getAttachRate(restaurantId, daysRaw) {
  const days = parseDays(daysRaw);
  const [categoryRows, totals] = await Promise.all([
    repo.getCategoryAttach(restaurantId, days),
    repo.getPeriodOrderTotals(restaurantId, days),
  ]);
  return { days, ...attachRate.buildAttachRate({ categoryRows, totals }) };
}

/** Service-charge-removed on its own — reused by the rules engine (Wave 4). */
async function getScRemoved(restaurantId, daysRaw) {
  const days = parseDays(daysRaw);
  const [scRow, scByServer, scRate] = await Promise.all([
    repo.getScRemoved(restaurantId, days),
    repo.getScRemovedByServer(restaurantId, days),
    repo.getServiceChargeRate(restaurantId),
  ]);
  return { days, ...billingMetrics.buildScRemoved(scRow, scByServer, { scRate }) };
}

/**
 * Recommendation performance — Phase 0 recsys, on guest_events. Two answers:
 *   funnel : does the recommender convert (saw picks → added → added a pick →
 *            ordered), abstaining below a session floor.
 *   margin : are the picks that land in carts our profitable dishes, joined to
 *            the same menu-engineering matrix the Menu Insights page uses.
 * Both read-only and tenant-scoped, like everything else here.
 */
async function getRecoPerformance(restaurantId, daysRaw) {
  const days = parseDays(daysRaw);
  // Read-through cache: this is called from the Recommendations page, both briefs,
  // the action evaluator and every reco outcome measurement — none needing
  // second-fresh numbers. See computeRecoPerformance for the actual work.
  return recoCache.wrap(`reco:${restaurantId}:${days}`, RECO_CACHE_TTL_MS,
    () => computeRecoPerformance(restaurantId, days));
}

/**
 * Drop the cached reco performance for a restaurant. Called whenever a dish's
 * `featured` flag changes (the manual toggle, autopilot, a revert) so the
 * Recommendations page doesn't keep showing the dish as un-featured — or a stale
 * margin verdict — for up to the cache TTL after the change.
 */
function bustRecoCache(restaurantId) {
  recoCache.clear(`reco:${restaurantId}`);
}

async function computeRecoPerformance(restaurantId, days) {
  const tz = await tzFor(restaurantId);
  const [counts, priorCounts, dishStats, impressions, perfRows, spanDays, featuredIds,
    revenueRow, byOccasionRows, byPartyRows, refineRow, byVariantRows, coverageRow, timingRow] = await Promise.all([
    repo.getRecoFunnelCounts(restaurantId, days),
    repo.getRecoFunnelCounts(restaurantId, days, days), // the equal window before this one
    repo.getRecoDishStats(restaurantId, days),
    repo.getRecoImpressions(restaurantId, days),
    repo.getMenuPerformance(restaurantId, days),
    repo.getSpanDays(restaurantId, tz, days),
    repo.getFeaturedMenuItemIds(restaurantId),
    repo.getRecoRevenue(restaurantId, days),
    repo.getRecoFunnelBySegment(restaurantId, days, 'entry'),
    repo.getRecoFunnelBySegment(restaurantId, days, 'partySize'),
    repo.getRecoRefineStats(restaurantId, days),
    repo.getRecoFunnelBySegment(restaurantId, days, 'variant'),
    repo.getRecoCoverage(restaurantId, days),
    repo.getRecoTiming(restaurantId, days),
  ]);

  const matrix = perf.buildMatrix(perf.buildPerformance(perfRows, { spanDays }));
  const stats = dishStats.map((d) => ({
    menuItemId: d.menu_item_id,
    dishName: d.dish_name,
    recoAdds: d.reco_adds,
    recoRemoves: d.reco_removes,
  }));
  const imps = impressions.map((i) => ({ menuItemId: i.menu_item_id, impressions: i.impressions }));

  const featured = new Set(featuredIds);
  const impById = new Map(imps.map((i) => [i.menuItemId, i.impressions]));
  const addsById = new Map(stats.map((s) => [s.menuItemId, s.recoAdds - s.recoRemoves]));
  const margin = recsysMargin.buildRecoMargin(stats, matrix, imps);
  for (const d of margin.dishes) d.featured = featured.has(d.menuItemId);

  // The lever's candidates: puzzles — high margin, low volume — are exactly the
  // dishes worth pushing. Surface each with its current reco exposure and whether
  // it's already featured, so the operator can promote the under-shown ones.
  const promote = (matrix.puzzles || []).map((p) => ({
    menuItemId: p.id,
    dishName: p.name,
    profitMargin: p.profitMargin,
    impressions: impById.get(p.id) || 0,
    recoAdds: addsById.get(p.id) || 0,
    featured: featured.has(p.id),
  })).sort((a, b) => b.profitMargin - a.profitMargin);

  return {
    days,
    funnel: recsysFunnel.buildRecoFunnel(counts, priorCounts),
    margin,
    promote,
    featuredCount: featured.size,
    revenue: recsysAnalytics.buildRevenueAttribution(revenueRow),
    segments: {
      byOccasion: recsysAnalytics.buildSegments(byOccasionRows),
      byPartySize: recsysAnalytics.buildSegments(byPartyRows),
    },
    refine: recsysAnalytics.buildRefineStats(refineRow),
    experiment: recsysAnalytics.buildExperiment(byVariantRows),
    coverage: {
      shownDishes: Number(coverageRow?.shown_dishes || 0),
      availableDishes: Number(coverageRow?.available_dishes || 0),
      pct: coverageRow && coverageRow.available_dishes > 0
        ? Math.round((coverageRow.shown_dishes / coverageRow.available_dishes) * 1000) / 10
        : null,
    },
    timing: {
      sessions: Number(timingRow?.sessions || 0),
      // Median seconds shown → first pick added; null below a small floor.
      medianSecondsToFirstAdd: timingRow && Number(timingRow.sessions) >= 10 && timingRow.median_seconds != null
        ? Math.round(Number(timingRow.median_seconds))
        : null,
    },
    concentration: recsysAnalytics.buildConcentration(stats),
  };
}

/** Passthrough for outcome tracking: one dish's reco impressions over a window. */
function getRecoImpressionsForDish(restaurantId, days, menuItemId) {
  return repo.getRecoImpressionsForDish(restaurantId, parseDays(days), menuItemId);
}

/** Guest cohorts — first-visit-month retention triangle + cumulative LTV. */
function getGuestCohorts(restaurantId) {
  return slowCache.wrap(`cohorts:${restaurantId}`, SLOW_CACHE_TTL_MS, async () => {
    const rows = await repo.getGuestCohorts(restaurantId, COHORT_WINDOW_MONTHS);
    return cohorts.buildCohorts(rows);
  });
}

/** Per-server performance over the window — dine-in orders, revenue, AOV, attach. */
async function getStaffPerformance(restaurantId, daysRaw) {
  const days = parseDays(daysRaw);
  const rows = await repo.getStaffPerformance(restaurantId, days);
  return {
    days,
    ...staffPerformance.buildStaffPerformance(
      rows.map((r) => ({ serverId: r.server_id, name: r.name, orders: r.orders, revenue: r.revenue, items: r.items })),
    ),
  };
}

module.exports = {
  DEFAULT_DAYS, MAX_DAYS, parseDays,
  getMenuInsights, getCrossSell, getNewItems, getServiceHours, getEconomics,
  getCouponEconomics, getAttachRate, getScRemoved, getRecoPerformance,
  getRecoImpressionsForDish, getStaffPerformance, getGuestCohorts, bustRecoCache,
};
