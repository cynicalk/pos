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
  const tz = await tzFor(restaurantId);
  const [counts, dishStats, perfRows, spanDays] = await Promise.all([
    repo.getRecoFunnelCounts(restaurantId, days),
    repo.getRecoDishStats(restaurantId, days),
    repo.getMenuPerformance(restaurantId, days),
    repo.getSpanDays(restaurantId, tz, days),
  ]);

  const matrix = perf.buildMatrix(perf.buildPerformance(perfRows, { spanDays }));
  const stats = dishStats.map((d) => ({
    menuItemId: d.menu_item_id,
    dishName: d.dish_name,
    recoAdds: d.reco_adds,
    recoRemoves: d.reco_removes,
  }));

  return {
    days,
    funnel: recsysFunnel.buildRecoFunnel(counts),
    margin: recsysMargin.buildRecoMargin(stats, matrix),
  };
}

module.exports = {
  DEFAULT_DAYS, MAX_DAYS, parseDays,
  getMenuInsights, getCrossSell, getNewItems, getServiceHours, getEconomics,
  getCouponEconomics, getAttachRate, getScRemoved, getRecoPerformance,
};
