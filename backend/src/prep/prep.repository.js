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

/**
 * Per-dish prep history for the surplus forecast (Phase 2): for each logged
 * service day, what was prepped (actual preferred, else plan) against what sold
 * on that same local day. Excludes today — only completed services are scored —
 * and any row with neither a plan nor an actual, which has nothing to forecast
 * from. Ordered oldest-first per dish so the weekday buckets read naturally.
 */
const getPrepHistory = (restaurantId, tz, days) =>
  db.query(
    `SELECT p.menu_item_id, p.menu_item_name, p.service_date::text AS service_date,
            COALESCE(p.actual_qty, p.planned_qty)::float8 AS prepped,
            COALESCE(s.sold, 0)::float8 AS sold
       FROM prep_logs p
       LEFT JOIN LATERAL (
         SELECT SUM(oi.quantity)::float8 AS sold
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE o.restaurant_id = p.restaurant_id
            AND o.status = 'paid'
            AND COALESCE(oi.status, '') <> 'cancelled'
            AND oi.menu_item_id = p.menu_item_id
            AND (o.created_at AT TIME ZONE $2)::date = p.service_date
       ) s ON true
      WHERE p.restaurant_id = $1
        AND p.service_date >= (now() AT TIME ZONE $2)::date - $3::int
        AND p.service_date <  (now() AT TIME ZONE $2)::date
        AND COALESCE(p.actual_qty, p.planned_qty) IS NOT NULL
      ORDER BY p.menu_item_id, p.service_date`,
    [restaurantId, tz, days],
  ).then((r) => r.rows);

/** Per-portion food cost per dish, from its recipe — null where none is costed. */
const getDishUnitCosts = (restaurantId) =>
  db.query(
    `SELECT mi.id AS menu_item_id,
            SUM(ri.quantity * COALESCE(i.latest_unit_cost, 0))
              / NULLIF(GREATEST(COALESCE(r.yield_quantity, 1), 1), 0) AS unit_cost
       FROM menu_items mi
       JOIN recipes r             ON r.id = mi.recipe_id
       JOIN recipe_ingredients ri ON ri.recipe_id = r.id
       JOIN ingredients i         ON i.id = ri.ingredient_id
      WHERE mi.restaurant_id = $1
        AND i.is_active = true
      GROUP BY mi.id, r.yield_quantity`,
    [restaurantId],
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
  getPrepHistory, getDishUnitCosts,
};
