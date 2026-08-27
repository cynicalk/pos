const db = require('../shared/db');

const getAll = (restaurantId) =>
  db
    .query('SELECT key, value FROM settings WHERE restaurant_id = $1', [restaurantId])
    .then((r) => Object.fromEntries(r.rows.map((row) => [row.key, row.value])));

const set = (restaurantId, key, value) =>
  db.query(
    `INSERT INTO settings (restaurant_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (restaurant_id, key) DO UPDATE SET value = $3`,
    [restaurantId, key, value],
  );

module.exports = { getAll, set };
