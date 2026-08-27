const db = require('../shared/db');

// from/to are calendar dates in the restaurant's timezone, so logged_at is
// converted to that zone before the ::date comparison — otherwise waste logged
// in the local-morning hours (when the UTC date is still "yesterday") falls
// outside a [today, today] window and never shows on the Overview.
const getAll = (restaurantId, { from, to, tz = 'UTC' } = {}) =>
  db
    .query(
      `SELECT wl.*, i.name AS ingredient_name, i.unit AS ingredient_unit
       FROM waste_logs wl
       JOIN ingredients i ON i.id = wl.ingredient_id
       WHERE wl.restaurant_id = $1
         AND ($2::date IS NULL OR (wl.logged_at AT TIME ZONE $4)::date >= $2::date)
         AND ($3::date IS NULL OR (wl.logged_at AT TIME ZONE $4)::date <= $3::date)
       ORDER BY wl.batch_id NULLS LAST, wl.logged_at DESC`,
      [restaurantId, from || null, to || null, tz],
    )
    .then((r) => r.rows);

const create = ({ restaurantId, ingredientId, quantity, unit, reason, costAtTime, totalCost, loggedBy, notes, menuItemId, menuItemName, batchId }) =>
  db
    .query(
      `INSERT INTO waste_logs
         (restaurant_id, ingredient_id, quantity, unit, reason, cost_at_time, total_cost,
          logged_by, notes, menu_item_id, menu_item_name, batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [restaurantId, ingredientId, quantity, unit, reason, costAtTime, totalCost,
       loggedBy || null, notes || null, menuItemId || null, menuItemName || null, batchId || null],
    )
    .then((r) => r.rows[0]);

module.exports = { getAll, create };
