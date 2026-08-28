const repo = require('./forecast.repository');
const snapshotsRepo = require('../snapshots/snapshots.repository');
const { validateTimezone, localDate, shiftDate } = require('../shared/timezone');
const baseline = require('../modules/forecast/baseline');
const mix = require('../modules/forecast/item-mix');
const prep = require('../modules/forecast/prep');
const inventory = require('../modules/forecast/inventory');

/**
 * Tier 0 demand forecast and the prep sheet that falls out of it.
 *
 * Two things this service is responsible for that the pure modules are not:
 *
 * 1. **Saying which model produced the number.** §VI.2: "Until it passes, the
 *    shipped forecast *is* the baseline and the UI says so." There is exactly
 *    one model here — seasonal naive — and every payload carries `model:
 *    'seasonal_naive'` plus the accuracy it actually achieved on its own
 *    rolling-origin backtest. Nothing is described as learned that was not.
 *
 * 2. **Keeping capacity out of the demand figure.** §II.2: sales are demand
 *    censored by supply. The forecast is a forecast of *sales*, because sales
 *    are what the history records. Seats, turns and the parties who left the
 *    waitlist are reported alongside it, clearly labelled, so a full Saturday
 *    reads as a possible ceiling rather than as the answer.
 */

/** History pulled for the model. Long enough for a season, bounded for cost. */
const HISTORY_DAYS = 180;

/**
 * Accuracy expectations, stated per grain (§VI.3).
 *
 * "Well-executed daily outlet-level forecasts land around 10–20% wMAPE; single
 * dishes are materially worse... Never let sales material quote item-level
 * accuracy from an outlet-level metric." These are the ranges the screen shows
 * beside the measured figure so the measured figure has a scale to sit against.
 */
const EXPECTED_WMAPE = {
  outlet: { low: 10, high: 20 },
  item: { low: 25, high: 45 },
};

/**
 * Re-key a day series onto one metric.
 *
 * The baseline forecasts whatever is in `value`, so the caller has to say which
 * quantity it means. This mattered more than it looks: the first version of the
 * prep sheet multiplied item shares by the *revenue* forecast, which asked for
 * one thousand nine hundred kilos of chicken to serve a twenty-eight thousand
 * rupee day. Rupees and portions are not interchangeable and nothing in the
 * types was going to catch it.
 */
const asMetric = (series, metric) => series.map((d) => ({
  date: d.date,
  orders: d.orders,
  items: d.items,
  value: metric === 'revenue' ? Number(d.value)
    : metric === 'orders' ? Number(d.orders)
      : Object.values(d.items || {}).reduce((s, q) => s + Number(q), 0),
}));

async function context(restaurantId) {
  // Same lookup the snapshot collector uses, so the forecast and the snapshots
  // it reads can never disagree about which timezone the day belongs to.
  const tz = validateTimezone(await snapshotsRepo.getTimezone(restaurantId), 'UTC');
  const series = await repo.getDailySeries(restaurantId, tz, HISTORY_DAYS);
  return { tz, series };
}

/** `YYYY-MM-DD` for tomorrow in the restaurant's own timezone. */
const tomorrowIn = (tz) => shiftDate(localDate(new Date(), tz), 1);

/**
 * Recipes keyed by dish name, in the shape prep.explode expects. One query, one
 * place — the prep sheet and the inventory projection explode the same recipes,
 * so they can never disagree about how much chicken a butter chicken needs.
 */
async function loadRecipeMap(restaurantId) {
  const rows = await repo.getRecipesByDish(restaurantId);
  const recipes = new Map();
  for (const row of rows) {
    if (!recipes.has(row.dish)) recipes.set(row.dish, { yield: row.yield, lines: [] });
    recipes.get(row.dish).lines.push({
      ingredientId: row.ingredient_id,
      name: row.ingredient_name,
      unit: row.unit,
      quantity: row.quantity,
      unitCost: row.unit_cost,
    });
  }
  return recipes;
}

/**
 * The outlet-total forecast for one date, with the accuracy it has earned.
 */
async function getDemand(restaurantId, { date } = {}) {
  const { tz, series } = await context(restaurantId);
  const target = date || tomorrowIn(tz);

  const revenueSeries = asMetric(series, 'revenue');
  const orderSeries = asMetric(series, 'orders');

  const residuals = baseline.backtest(revenueSeries);
  const forecast = baseline.forecastDay(revenueSeries, target, { residuals });
  const orders = baseline.forecastDay(orderSeries, target);

  // Measured on the outlet total, and labelled as such. The item-grain figure
  // is deliberately absent rather than borrowed from this one.
  const wmape = baseline.weightedMape(residuals.slice(-56));

  const trading = series.filter((d) => !baseline.isClosed(d));
  const { factors, samples } = baseline.weekdayFactors(trading);

  return {
    timezone: tz,
    date: target,
    model: 'seasonal_naive',
    isBaselineModel: true,
    forecast,
    orders,
    accuracy: {
      grain: 'outlet_total',
      wmape,
      measuredOver: residuals.slice(-56).length,
      expected: EXPECTED_WMAPE.outlet,
      note: 'Measured on this model’s own errors, re-fitted on each day before '
        + 'the one being scored. It describes the outlet total and nothing finer.',
    },
    weekdayShape: factors.map((factor, dow) => ({ dow, factor, samples: samples[dow] })),
    history: {
      tradingDays: trading.length,
      closedDays: series.length - trading.length,
      firstDay: series[0]?.date ?? null,
      lastDay: series[series.length - 1]?.date ?? null,
    },
    series: series.slice(-56),
  };
}

/**
 * The prep sheet: total → item mix → ingredients.
 *
 * Every figure traces back through a named dish to a recipe the operator wrote.
 * The two places it can be incomplete — dishes routed out of the mix as
 * intermittent, and dishes with no recipe — are both reported rather than
 * quietly dropped, because a sheet that silently covers four fifths of service
 * is worse than one that says so.
 */
async function getPrepSheet(restaurantId, { date } = {}) {
  const { tz, series } = await context(restaurantId);
  const target = date || tomorrowIn(tz);

  // The mix is a share of *portions*, so it must ride on a portion forecast.
  const qtySeries = asMetric(series, 'items');
  const total = baseline.forecastDay(qtySeries, target);
  const revenue = baseline.forecastDay(asMetric(series, 'revenue'), target);

  if (total.point === null) {
    return {
      timezone: tz,
      date: target,
      model: 'seasonal_naive',
      total,
      items: [],
      irregular: [],
      ingredients: [],
      uncosted: [],
      reason: total.reason,
    };
  }

  const trading = qtySeries.filter((d) => !baseline.isClosed(d));
  const shares = mix.buildShares(trading, target);
  const items = mix.itemForecast(total, shares);

  const recipes = await loadRecipeMap(restaurantId);
  const sheet = prep.explode(items, recipes);

  return {
    timezone: tz,
    date: target,
    model: 'seasonal_naive',
    isBaselineModel: true,
    // `total` is forecast portions across the menu; `revenue` is the same day in
    // rupees. Kept as two clearly named figures because conflating them is
    // exactly the mistake this code made once already.
    total,
    revenue,
    items,
    // Dishes the model will not give a share to, and why (§III.5).
    irregular: shares.irregular,
    mixCoverage: shares.covered,
    ingredients: sheet.ingredients,
    uncosted: sheet.uncosted,
    recipeCoveragePct: sheet.coveragePct,
    totalIngredientCost: sheet.totalCost,
    poolingDepth: prep.poolingDepth(sheet.ingredients),
    accuracy: {
      grain: 'item',
      expected: EXPECTED_WMAPE.item,
      note: 'No item-level accuracy figure is published. It has not been measured '
        + 'at this grain, and quoting the outlet-total figure here would overstate '
        + 'how well a single dish can be predicted.',
    },
    // Never a prep instruction (§III.5, §IV.1).
    prepDecision: {
      isRecommendation: false,
      note: 'These are forecast quantities, not prep quantities. Choosing how much '
        + 'to prep needs the cost of running out weighed against the cost of binning '
        + 'it, which needs shelf life and substitution data CookLyt does not hold.',
    },
  };
}

/** Capacity and turned-away trade, reported beside the forecast, never inside it. */
async function getCapacity(restaurantId, { date } = {}) {
  const tz = validateTimezone(await snapshotsRepo.getTimezone(restaurantId), 'UTC');
  const target = date || tomorrowIn(tz);
  const raw = await repo.getCapacitySignal(restaurantId, tz, target);

  const seats = Number(raw.total_seats) || 0;
  const avgMinutes = raw.avg_minutes === null ? null : Number(raw.avg_minutes);
  const sessions = Number(raw.sessions) || 0;

  // Without a measured turn time there is no seat ceiling to state. A guessed
  // one would be the most quietly wrong number on the page.
  const servicehours = 10;
  const estimatedCovers = avgMinutes && avgMinutes > 0 && sessions >= 20
    ? Math.round(seats * ((servicehours * 60) / avgMinutes))
    : null;

  return {
    timezone: tz,
    date: target,
    seats,
    tables: Number(raw.table_count) || 0,
    avgTurnMinutes: avgMinutes === null ? null : Math.round(avgMinutes),
    turnSampleSize: sessions,
    estimatedCoverCeiling: estimatedCovers,
    ceilingBasis: estimatedCovers === null
      ? 'not_enough_seated_history'
      : 'seats_times_measured_turns',
    turnedAwayLast28Days: Number(raw.turned_away_28d) || 0,
    note: 'Sales are demand with a lid on it. The forecast predicts sales, because '
      + 'sales are what the history records — these figures say how much room there '
      + 'was to record them in.',
  };
}

/** Default forward window for the stock projection. */
const INVENTORY_HORIZON_DAYS = 14;
/** Default supplier lead time the reorder plan reorders at (§ "Buildable on h=3"). */
const REORDER_LEAD_DAYS = 3;

/**
 * Walk each ingredient's stock down against the forecast, day by day.
 *
 * Shared by the inventory-forecast and reorder screens so both read the exact
 * same consumption. Each forecast day gets its own portion total *and* its own
 * weekday-tilted item mix — a Saturday and a Tuesday draw different ingredients
 * — then explodes through the recipes and accumulates per ingredient.
 */
async function projectInventory(restaurantId, { date, horizonDays = INVENTORY_HORIZON_DAYS } = {}) {
  const { tz, series } = await context(restaurantId);
  const start = date || tomorrowIn(tz);

  const qtySeries = asMetric(series, 'items');
  const trading = qtySeries.filter((d) => !baseline.isClosed(d));
  const recipes = await loadRecipeMap(restaurantId);
  const stock = await repo.getIngredientsStock(restaurantId);

  // consumption[ingredientId] = number[] of length horizonDays.
  const consumption = {};
  for (const ing of stock) consumption[ing.id] = new Array(horizonDays).fill(0);

  let forecastableDays = 0;
  let coverageSum = 0;
  const dayTotals = [];

  for (let d = 0; d < horizonDays; d += 1) {
    const day = shiftDate(start, d);
    const total = baseline.forecastDay(qtySeries, day);
    if (total.point === null) { dayTotals.push({ date: day, portions: null }); continue; }

    forecastableDays += 1;
    const shares = mix.buildShares(trading, day);
    coverageSum += shares.covered ?? 0;
    const items = mix.itemForecast(total, shares);
    const sheet = prep.explode(items, recipes);
    dayTotals.push({ date: day, portions: total.point });

    for (const ing of sheet.ingredients) {
      if (consumption[ing.ingredientId]) consumption[ing.ingredientId][d] += ing.quantity;
    }
  }

  const ingredients = stock.map((r) => ({
    id: r.id,
    name: r.name,
    unit: r.unit,
    stockOnHand: r.stock_on_hand,
    reorderLevel: r.reorder_level,
    reorderQty: r.reorder_qty,
    unitCost: r.unit_cost,
    perishable: r.perishable,
  }));

  const projection = inventory.project(ingredients, consumption, horizonDays);

  return {
    tz,
    start,
    horizonDays,
    projection,
    dayTotals,
    forecastableDays,
    // Average share of item volume the mix speaks for across the horizon — the
    // same honest denominator the prep sheet carries, so the operator knows the
    // projection covers most of service, not all of it.
    mixCoverage: forecastableDays > 0 ? coverageSum / forecastableDays : 0,
  };
}

/**
 * Inventory forecasting: where each ingredient's stock is heading.
 */
async function getInventoryForecast(restaurantId, { date, horizonDays } = {}) {
  const { tz, start, projection, dayTotals, forecastableDays, mixCoverage, horizonDays: h } =
    await projectInventory(restaurantId, { date, horizonDays });

  const drawn = projection.filter((p) => p.drawnByForecast);
  return {
    timezone: tz,
    startDate: start,
    horizonDays: h,
    model: 'seasonal_naive',
    isBaselineModel: true,
    projection,
    dayTotals,
    summary: {
      tracked: projection.length,
      drawnByForecast: drawn.length,
      belowReorderNow: projection.filter((p) => p.status === 'below_reorder_now').length,
      stockoutWithinHorizon: projection.filter((p) => p.status === 'stockout_within_horizon').length,
      reorderWithinHorizon: projection.filter((p) => p.status === 'reorder_within_horizon').length,
    },
    forecastableDays,
    mixCoverage,
    coverageNote:
      'Only ingredients used by dishes the forecast can speak to — recipe-costed, '
      + 'regularly-sold dishes — get a depletion date. An ingredient shown as "not '
      + 'drawn by the forecast" is either unused by any costed dish or used only by '
      + 'intermittent ones; its stock is real, its burn is not yet knowable here.',
    accuracy: {
      grain: 'ingredient',
      note: 'Ingredient demand pools across dishes, so it is steadier than any single '
        + 'dish forecast — but no accuracy figure is published at this grain because '
        + 'none has been measured. The depletion dates inherit the outlet-total error.',
    },
  };
}

/**
 * Auto reorder: the subset that needs an order placed within the lead time.
 */
async function getReorderPlan(restaurantId, { date, leadDays = REORDER_LEAD_DAYS, reviewDays } = {}) {
  const { tz, start, projection, horizonDays } =
    await projectInventory(restaurantId, { date });

  const suggestions = inventory.reorderPlan(projection, { leadDays, reviewDays });
  const totalCost = suggestions.reduce((s, x) => s + x.suggestedCost, 0);

  return {
    timezone: tz,
    startDate: start,
    horizonDays,
    leadDays,
    model: 'seasonal_naive',
    isBaselineModel: true,
    suggestions,
    summary: {
      lines: suggestions.length,
      urgentNow: suggestions.filter((s) => s.urgency === 'now').length,
      perishableWasteFlags: suggestions.filter((s) => s.perishableWasteRisk).length,
      totalCost,
    },
    decision: {
      isRecommendation: false,
      note: 'These are order-by-lead-time suggestions from your reorder levels and the '
        + 'forecast — not commitments. Quantity defaults to your configured reorder_qty, '
        + 'or the forecast need where none is set; a perishable that would sit longer '
        + 'than a few days of demand is flagged, because only you hold its shelf life.',
    },
  };
}

module.exports = {
  getDemand,
  getPrepSheet,
  getCapacity,
  getInventoryForecast,
  getReorderPlan,
  HISTORY_DAYS,
  EXPECTED_WMAPE,
  INVENTORY_HORIZON_DAYS,
  REORDER_LEAD_DAYS,
};
