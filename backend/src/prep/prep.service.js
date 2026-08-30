const repo = require('./prep.repository');
const forecastService = require('../forecast/forecast.service');
const snapshotsRepo = require('../snapshots/snapshots.repository');
const reconcile = require('../modules/forecast/prep-reconcile');
const prepWaste = require('../modules/forecast/prep-waste');
const { validateTimezone, localDate } = require('../shared/timezone');
const { ValidationError } = require('../shared/errors');

/*
 * Prep logging + reconciliation (Phase 1 of Waste Prediction).
 *
 * Two capture points onto one row per dish per day: a pre-service plan (nudged
 * from the forecast) and a post-service actual. Then reconciliation joins the
 * logged prep against what sold and what was binned. The prediction that scores
 * against this history is Phase 2 — this phase just makes the number exist and
 * shows how the decision landed.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(d) {
  if (!d || !ISO_DATE.test(d)) throw new ValidationError('date must be YYYY-MM-DD');
  return d;
}

async function timezoneFor(restaurantId) {
  return validateTimezone(await snapshotsRepo.getTimezone(restaurantId), 'UTC');
}

/**
 * The planning sheet: every sellable dish, with the forecast's proposed prep and
 * whatever plan/actual has already been logged for the day. The screen pre-fills
 * the plan input from the forecast, so logging is a confirm, not data entry.
 */
async function getPlanningSheet(restaurantId, { date } = {}) {
  const tz = await timezoneFor(restaurantId);
  const serviceDate = date || localDate(new Date(), tz);
  assertDate(serviceDate);

  const [menu, logs, forecast] = await Promise.all([
    repo.getMenuItems(restaurantId),
    repo.getPrepLogs(restaurantId, serviceDate),
    forecastService.getPrepSheet(restaurantId, { date: serviceDate }).catch(() => ({ items: [] })),
  ]);

  const forecastByName = new Map((forecast.items || []).map((i) => [i.name, i.qty]));
  const logByItem = new Map(logs.map((l) => [l.menu_item_id, l]));

  const rows = menu.map((m) => {
    const log = logByItem.get(m.id);
    const fq = forecastByName.has(m.name) ? Math.round(forecastByName.get(m.name)) : null;
    return {
      menuItemId: m.id,
      name: m.name,
      category: m.category,
      // The forecast the plan should default to: the logged snapshot if we have
      // one, else today's live forecast.
      forecastQty: log?.forecast_qty != null ? Number(log.forecast_qty) : fq,
      plannedQty: log?.planned_qty != null ? Number(log.planned_qty) : null,
      actualQty: log?.actual_qty != null ? Number(log.actual_qty) : null,
    };
  });

  return {
    date: serviceDate,
    timezone: tz,
    forecastAvailable: (forecast.items || []).length > 0,
    rows,
  };
}

// Validate an entry list against the live menu and coerce quantities. Shared by
// both capture points. A blank/removed quantity is allowed through as null so an
// operator can clear a mistaken log.
function normaliseEntries(entries, menuById) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new ValidationError('entries must be a non-empty array');
  }
  return entries.map((e) => {
    const item = menuById.get(e.menuItemId);
    if (!item) throw new ValidationError(`unknown menu item: ${e.menuItemId}`);
    const raw = e.qty ?? e.plannedQty ?? e.actualQty;
    const qty = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    if (qty !== null && (!Number.isFinite(qty) || qty < 0)) {
      throw new ValidationError(`quantity for ${item.name} must be zero or more`);
    }
    return { menuItemId: item.id, name: item.name, qty, forecastQty: e.forecastQty ?? null };
  });
}

async function savePlanned(restaurantId, { date, entries, userId }) {
  const serviceDate = assertDate(date);
  const menuById = new Map((await repo.getMenuItems(restaurantId)).map((m) => [m.id, m]));
  const rows = normaliseEntries(entries, menuById);
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    await repo.upsertPlanned(restaurantId, {
      menuItemId: r.menuItemId, menuItemName: r.name, serviceDate,
      plannedQty: r.qty, forecastQty: r.forecastQty, userId,
    });
  }
  return { saved: rows.length, date: serviceDate };
}

async function saveActual(restaurantId, { date, entries, userId }) {
  const serviceDate = assertDate(date);
  const menuById = new Map((await repo.getMenuItems(restaurantId)).map((m) => [m.id, m]));
  const rows = normaliseEntries(entries, menuById);
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    await repo.upsertActual(restaurantId, {
      menuItemId: r.menuItemId, menuItemName: r.name, serviceDate, actualQty: r.qty, userId,
    });
  }
  return { saved: rows.length, date: serviceDate };
}

/**
 * How a past day's prep landed: prepped (actual or plan) vs sold vs binned.
 */
async function getReconciliation(restaurantId, { date } = {}) {
  const tz = await timezoneFor(restaurantId);
  const serviceDate = date || localDate(new Date(), tz);
  assertDate(serviceDate);

  const [logs, sold, waste] = await Promise.all([
    repo.getPrepLogs(restaurantId, serviceDate),
    repo.getSoldByDish(restaurantId, tz, serviceDate),
    repo.getOverprepCostByDish(restaurantId, tz, serviceDate),
  ]);

  const soldByItem = new Map(sold.map((s) => [s.menu_item_id, Number(s.sold)]));
  const wasteByItem = new Map(waste.map((w) => [w.menu_item_id, Number(w.cost)]));

  const rows = logs.map((l) => ({
    menuItemId: l.menu_item_id,
    name: l.menu_item_name,
    forecastQty: l.forecast_qty,
    plannedQty: l.planned_qty,
    actualQty: l.actual_qty,
    sold: soldByItem.get(l.menu_item_id) || 0,
    loggedWasteCost: wasteByItem.get(l.menu_item_id) || 0,
  }));

  return {
    date: serviceDate,
    timezone: tz,
    ...reconcile.buildReconciliation(rows),
  };
}

/** Days of prep history the surplus forecast reads back over. */
const HISTORY_DAYS = 90;

function tomorrowLocal(tz) {
  const today = localDate(new Date(), tz);
  const [y, m, d] = today.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * Phase 2 — forecast tomorrow's likely over-prep per dish, from the prep history
 * Phase 1 has been accumulating. Abstains, per dish, below a history floor; it
 * never fills the gap with a zero. The forecast quantity for the day rides along
 * so the screen can show the measured surplus against what the model expects to
 * sell — the reference point the operator trims toward, since the system still
 * refuses to prescribe a prep number of its own.
 */
async function getPrepForecast(restaurantId, { date } = {}) {
  const tz = await timezoneFor(restaurantId);
  const targetDate = date || tomorrowLocal(tz);
  assertDate(targetDate);

  const [history, costs, forecast] = await Promise.all([
    repo.getPrepHistory(restaurantId, tz, HISTORY_DAYS),
    repo.getDishUnitCosts(restaurantId),
    forecastService.getPrepSheet(restaurantId, { date: targetDate }).catch(() => ({ items: [] })),
  ]);

  const costByItem = new Map(costs.map((c) => [c.menu_item_id, c.unit_cost == null ? null : Number(c.unit_cost)]));
  const forecastByName = new Map((forecast.items || []).map((i) => [i.name, i.qty]));

  // Group the flat history rows into per-dish day series.
  const byDish = new Map();
  for (const row of history) {
    if (!byDish.has(row.menu_item_id)) {
      byDish.set(row.menu_item_id, { menuItemId: row.menu_item_id, name: row.menu_item_name, days: [] });
    }
    byDish.get(row.menu_item_id).days.push({ date: row.service_date, prepped: row.prepped, sold: row.sold });
  }

  const dishes = [...byDish.values()].map((d) => ({
    ...d,
    unitCost: costByItem.has(d.menuItemId) ? costByItem.get(d.menuItemId) : null,
    forecastQty: forecastByName.has(d.name) ? Math.round(forecastByName.get(d.name)) : null,
  }));

  return {
    timezone: tz,
    forecastAvailable: (forecast.items || []).length > 0,
    ...prepWaste.buildPrepForecast({ dishes, targetDate }),
  };
}

module.exports = { getPlanningSheet, savePlanned, saveActual, getReconciliation, getPrepForecast };
