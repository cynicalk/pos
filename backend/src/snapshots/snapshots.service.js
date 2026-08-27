const repo = require('./snapshots.repository');
const { validateTimezone } = require('../shared/timezone');

// How many recent days get rewritten on every pass. A trading day is not final
// when it ends — a late payment, a void, or a corrected order still moves it —
// so the tail is recomputed rather than trusted.
const REFRESH_DAYS = 3;

// The history depth the forecasting family needs before it can say anything
// honest. Sourced from the ops app's own Phase E finding: 40 orders over 16
// days, 2-3 samples per weekday, is not enough to estimate a Saturday effect
// let alone a seasonality. 8 weeks is the low end of the 8-12 week range.
const FORECAST_MIN_DAYS = 56;

/** Write every trading day that is missing or still moving, for one restaurant. */
async function collect(restaurantId) {
  const tz = validateTimezone(await repo.getTimezone(restaurantId), 'UTC');
  const days = await repo.findPendingDays(restaurantId, tz, REFRESH_DAYS);

  let written = 0;
  for (const day of days) {
    await repo.upsertDay(restaurantId, day, tz);
    written += 1;
  }
  return { restaurantId, timezone: tz, days: written };
}

/**
 * Force one specific trading day to be recomputed.
 *
 * `collect` deliberately leaves days older than REFRESH_DAYS alone — rewriting
 * all history on every pass would cost more each day the restaurant stays open.
 * The trade-off is that a correction to an order older than the window (a void
 * posted late, a backdated fix) would otherwise never reach its snapshot. This
 * is the escape hatch for that case, and what an admin "recompute this day"
 * action will call.
 */
async function collectDay(restaurantId, day) {
  const tz = validateTimezone(await repo.getTimezone(restaurantId), 'UTC');
  await repo.upsertDay(restaurantId, day, tz);
  return { restaurantId, timezone: tz, day };
}

/** Same, for every active restaurant. One failure must not stop the rest. */
async function collectAll() {
  const ids = await repo.listActiveRestaurants();
  const results = [];
  for (const id of ids) {
    try {
      results.push(await collect(id));
    } catch (err) {
      console.error('[snapshots] collect failed for', id, '—', err.message);
    }
  }
  return results;
}

/**
 * History depth, for the `collecting` shell state.
 *
 * `days` is a real count of closed days actually stored — never an estimate,
 * and never rounded up. `ready` says plainly whether the forecasting family has
 * enough to work with. The UI shows this instead of a dimmed fake chart.
 */
async function getCoverage(restaurantId) {
  const tz = validateTimezone(await repo.getTimezone(restaurantId), 'UTC');
  const row = await repo.getCoverage(restaurantId, tz);
  const days = Number(row?.days || 0);

  return {
    days,
    firstDay: row?.first_day || null,
    lastDay: row?.last_day || null,
    requiredDays: FORECAST_MIN_DAYS,
    remainingDays: Math.max(0, FORECAST_MIN_DAYS - days),
    ready: days >= FORECAST_MIN_DAYS,
  };
}

module.exports = {
  collect, collectDay, collectAll, getCoverage, FORECAST_MIN_DAYS, REFRESH_DAYS,
};
