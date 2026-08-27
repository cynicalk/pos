const db = require('../shared/db');

// Create an open count and pre-populate a line for every active ingredient,
// snapshotting the current system stock_on_hand for later reference.
const createCount = ({ restaurantId, label, notes, createdBy }) =>
  db.withTransaction(async (client) => {
    const { rows: [count] } = await client.query(
      `INSERT INTO stock_counts (restaurant_id, label, notes, created_by, status)
       VALUES ($1, $2, $3, $4, 'open') RETURNING *`,
      [restaurantId, label, notes || null, createdBy || null],
    );
    await client.query(
      `INSERT INTO stock_count_lines (stock_count_id, ingredient_id, system_qty, unit)
       SELECT $1, id, stock_on_hand, unit
       FROM ingredients WHERE restaurant_id = $2 AND is_active = true`,
      [count.id, restaurantId],
    );
    return count;
  });

const listCounts = (restaurantId) =>
  db
    .query(
      `SELECT sc.*, COUNT(scl.id)::int AS line_count,
              COUNT(scl.counted_qty)::int AS counted_lines
       FROM stock_counts sc
       LEFT JOIN stock_count_lines scl ON scl.stock_count_id = sc.id
       WHERE sc.restaurant_id = $1
       GROUP BY sc.id
       ORDER BY COALESCE(sc.counted_at, sc.created_at) DESC`,
      [restaurantId],
    )
    .then((r) => r.rows);

const getCountHeader = (id, restaurantId) =>
  db
    .query('SELECT * FROM stock_counts WHERE id = $1 AND restaurant_id = $2', [id, restaurantId])
    .then((r) => r.rows[0]);

const getCountLines = (countId) =>
  db
    .query(
      `SELECT scl.id, scl.ingredient_id, scl.counted_qty, scl.system_qty, scl.unit,
              i.name AS ingredient_name, i.latest_unit_cost, i.is_active
       FROM stock_count_lines scl
       JOIN ingredients i ON i.id = scl.ingredient_id
       WHERE scl.stock_count_id = $1
       ORDER BY i.name`,
      [countId],
    )
    .then((r) => r.rows);

// Upsert counted quantities. `lines` is [{ ingredientId, countedQty }]; only
// ingredients belonging to this restaurant are written (others are skipped).
const saveLines = (countId, restaurantId, lines) =>
  db.withTransaction(async (client) => {
    for (const { ingredientId, countedQty } of lines) {
      await client.query(
        `INSERT INTO stock_count_lines (stock_count_id, ingredient_id, counted_qty, unit)
         SELECT $1, i.id, $3, i.unit
         FROM ingredients i WHERE i.id = $2 AND i.restaurant_id = $4
         ON CONFLICT (stock_count_id, ingredient_id)
         DO UPDATE SET counted_qty = EXCLUDED.counted_qty`,
        [countId, ingredientId, countedQty, restaurantId],
      );
    }
  });

// Mark finalized and snapshot the current system stock for every line so the
// count records both what was physically there and what the system thought.
const finalizeCount = (countId, restaurantId) =>
  db.withTransaction(async (client) => {
    await client.query(
      `UPDATE stock_count_lines scl
       SET system_qty = i.stock_on_hand
       FROM ingredients i
       WHERE i.id = scl.ingredient_id AND scl.stock_count_id = $1`,
      [countId],
    );
    const { rows: [count] } = await client.query(
      `UPDATE stock_counts
       SET status = 'finalized', counted_at = NOW()
       WHERE id = $1 AND restaurant_id = $2 AND status = 'open'
       RETURNING *`,
      [countId, restaurantId],
    );
    return count;
  });

const deleteCount = (id, restaurantId) =>
  db
    .query(
      "DELETE FROM stock_counts WHERE id = $1 AND restaurant_id = $2 AND status = 'open' RETURNING id",
      [id, restaurantId],
    )
    .then((r) => r.rows[0]);

module.exports = {
  createCount, listCounts, getCountHeader, getCountLines,
  saveLines, finalizeCount, deleteCount,
};
