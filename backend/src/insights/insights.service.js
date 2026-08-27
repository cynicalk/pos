const repo = require('./insights.repository');
const perf = require('../modules/menu/performance');
const crossSell = require('../modules/menu/cross-sell');
const newItems = require('../modules/menu/new-items');
const hours = require('../modules/dinein/hours');
const economics = require('../modules/economics/unit-economics');
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
  const primeCost = labourHours.computePrimeCost({
    foodCost: base.foodCost.foodCost,
    labourCost: labour.labourCost,
    revenue,
    hasFoodCost: base.foodCost.foodCostPct !== null,
    hasLabour: labour.totalHours > 0,
  });

  return { ...base, labour, primeCost };
}

module.exports = {
  DEFAULT_DAYS, MAX_DAYS, parseDays,
  getMenuInsights, getCrossSell, getNewItems, getServiceHours, getEconomics,
};
