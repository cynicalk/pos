const db = require('../shared/db');

/*
 * Prep-log data access. Two upsert paths (plan pre-service, actual post-service)
 * onto one row per dish per day, plus the reads the reconciliation joins: sold
 * portions and logged over-prep cost for the same local day.
 */

/** Pre-service: the chef's intended prep, with the forecast snapshotted alongside. */
const upsertPlanned = (restaurantId, { menuItemId, menuItemName, serviceDate, plannedQty, forecastQty, userId }) =>
  db.query(
    `INSERT INTO prep_logs
       (restaurant_id, menu_item_id, menu_item_name, service_date, planned_qty, forecast_qty, planned_by, planned_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (restaurant_id, menu_item_id, service_date) DO UPDATE
       SET planned_qty = EXCLUDED.planned_qty,
           menu_item_name = EXCLUDED.menu_item_name,
           forecast_qty = COALESCE(prep_logs.forecast_qty, EXCLUDED.forecast_qty),
           planned_by = EXCLUDED.planned_by,
           planned_at = now(),
           updated_at = now()
     RETURNING id`,
    [restaurantId, menuItemId, menuItemName, serviceDate, plannedQty, forecastQty ?? null, userId || null],
  ).then((r) => r.rows[0]);

/** Post-service: what was actually made. */
const upsertActual = (restaurantId, { menuItemId, menuItemName, serviceDate, actualQty, userId }) =>
  db.query(
    `INSERT INTO prep_logs
       (restaurant_id, menu_item_id, menu_item_name, service_date, actual_qty, actual_by, actual_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (restaurant_id, menu_item_id, service_date) DO UPDATE
       SET actual_qty = EXCLUDED.actual_qty,
           menu_item_name = EXCLUDED.menu_item_name,
           actual_by = EXCLUDED.actual_by,
           actual_at = now(),
           updated_at = now()
     RETURNING id`,
    [restaurantId, menuItemId, menuItemName, serviceDate, actualQty, userId || null],
  ).then((r) => r.rows[0]);

const getPrepLogs = (restaurantId, serviceDate) =>
  db.query(
    `SELECT menu_item_id, menu_item_name, forecast_qty, planned_qty, actual_qty,
            planned_at, actual_at
       FROM prep_logs
      WHERE restaurant_id = $1 AND service_date = $2`,
    [restaurantId, serviceDate],
  ).then((r) => r.rows);

/** Portions sold per dish on a local day (cancelled lines excluded). */
const getSoldByDish = (restaurantId, tz, serviceDate) =>
  db.query(
    `SELECT oi.menu_item_id, SUM(oi.quantity)::float8 AS sold
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE o.restaurant_id = $1
        AND o.status = 'paid'
        AND COALESCE(oi.status, '') <> 'cancelled'
        AND (o.created_at AT TIME ZONE $2)::date = $3
      GROUP BY oi.menu_item_id`,
    [restaurantId, tz, serviceDate],
  ).then((r) => r.rows);

/** Cost logged as OVERPREP per dish on a local day — the confirmed-binned figure. */
const getOverprepCostByDish = (restaurantId, tz, serviceDate) =>
  db.query(
    `SELECT menu_item_id, SUM(total_cost)::float8 AS cost
       FROM waste_logs
      WHERE restaurant_id = $1
        AND reason = 'OVERPREP'
        AND menu_item_id IS NOT NULL
        AND (logged_at AT TIME ZONE $2)::date = $3
      GROUP BY menu_item_id`,
    [restaurantId, tz, serviceDate],
  ).then((r) => r.rows);

/** Live sellable dishes, to hang a prep plan on and to validate an id belongs here. */
const getMenuItems = (restaurantId) =>
  db.query(
    `SELECT id, name, category
       FROM menu_items
      WHERE restaurant_id = $1 AND available = true AND archived_at IS NULL
      ORDER BY category NULLS LAST, name`,
    [restaurantId],
  ).then((r) => r.rows);

module.exports = {
  upsertPlanned, upsertActual, getPrepLogs, getSoldByDish, getOverprepCostByDish, getMenuItems,
};
