const db = require('../shared/db');

/**
 * Everything the Tier 0 forecast reads.
 *
 * The daily series comes from `daily_snapshots` rather than from `orders`, on
 * purpose. The snapshot is written by one query whose revenue definition is
 * character-for-character the one the daily report uses, and its `item_sales`
 * counts only paid orders and excludes cancelled lines — "a forecast should
 * learn what guests bought, not what was rung up and voided". Reading orders
 * directly here would be a second definition of revenue in the same system,
 * which is the drift bug that surfaces months later, inside a forecast.
 */

/**
 * Closed trading days, oldest first. `items` is `{ dishName: qty }`.
 *
 * Today is excluded deliberately. A day half over has half its takings, and a
 * partial day dragged into the level would pull every forecast down by however
 * much of the day is left — the same trap the anomaly detector was fixed for.
 */
const getDailySeries = (restaurantId, tz, days) =>
  db.query(
    `SELECT snapshot_date::text        AS date,
            total_orders::int          AS orders,
            total_revenue::float8      AS value,
            item_sales                 AS items
       FROM daily_snapshots
      WHERE restaurant_id = $1
        AND snapshot_date >= (now() AT TIME ZONE $2)::date - $3::int
        AND snapshot_date <  (now() AT TIME ZONE $2)::date
      ORDER BY snapshot_date ASC`,
    [restaurantId, tz, days],
  ).then((r) => r.rows);

/**
 * Recipes keyed by the menu item they belong to, with per-line quantities.
 *
 * `menu_items.name` is the key because that is what `item_sales` records — a
 * snapshot stores the item name as it was sold, so a renamed dish keeps its
 * history under the old name and the join has to happen on the same thing.
 */
const getRecipesByDish = (restaurantId) =>
  db.query(
    `SELECT mi.name                       AS dish,
            r.yield_quantity::float8      AS yield,
            ri.ingredient_id              AS ingredient_id,
            i.name                        AS ingredient_name,
            ri.unit                       AS unit,
            ri.quantity::float8           AS quantity,
            i.latest_unit_cost::float8    AS unit_cost
       FROM menu_items mi
       JOIN recipes r            ON r.id = mi.recipe_id
       JOIN recipe_ingredients ri ON ri.recipe_id = r.id
       JOIN ingredients i         ON i.id = ri.ingredient_id
      WHERE mi.restaurant_id = $1
        AND mi.archived_at IS NULL
        AND i.is_active = true`,
    [restaurantId],
  ).then((r) => r.rows);

/**
 * Seats × turns as a capacity ceiling, and the trade that did not become a sale.
 *
 * §II.2: sales are demand censored by supply, and `waitlist` is "the only place
 * in the entire system recording demand that did not become a sale". Reported
 * beside the forecast, never folded into it.
 */
const getCapacitySignal = (restaurantId, tz, targetDate) =>
  db.query(
    `WITH seats AS (
       SELECT COALESCE(SUM(seats), 0)::int AS total_seats,
              COUNT(*)::int                AS table_count
         FROM tables WHERE restaurant_id = $1
     ),
     turns AS (
       SELECT AVG(duration_minutes)::float8 AS avg_minutes,
              COUNT(*)::int                 AS sessions
         FROM table_sessions
        WHERE restaurant_id = $1
          AND started_at >= now() - INTERVAL '28 days'
          AND duration_minutes > 0
     ),
     turned_away AS (
       SELECT COUNT(*)::int AS n
         FROM waitlist
        WHERE restaurant_id = $1
          AND status IN ('cancelled', 'no_show')
          AND (joined_at AT TIME ZONE $2)::date
              >= (now() AT TIME ZONE $2)::date - 28
     )
     SELECT seats.total_seats, seats.table_count,
            turns.avg_minutes, turns.sessions,
            turned_away.n AS turned_away_28d
       FROM seats, turns, turned_away`,
    [restaurantId, tz],
  ).then((r) => ({ ...r.rows[0], targetDate }));

/**
 * Every active ingredient with the stock facts the projection walks down.
 *
 * `stock_on_hand`, `reorder_level` and `reorder_qty` are the operator's own —
 * the projection reads them, it does not invent them. A `reorder_qty` of zero
 * means "not configured", and the reorder plan falls back to the forecast need.
 */
const getIngredientsStock = (restaurantId) =>
  db.query(
    `SELECT id,
            name,
            unit,
            stock_on_hand::float8    AS stock_on_hand,
            reorder_level::float8    AS reorder_level,
            reorder_qty::float8      AS reorder_qty,
            latest_unit_cost::float8 AS unit_cost,
            perishable
       FROM ingredients
      WHERE restaurant_id = $1 AND is_active = true
      ORDER BY name`,
    [restaurantId],
  ).then((r) => r.rows);

module.exports = { getDailySeries, getRecipesByDish, getCapacitySignal, getIngredientsStock };
