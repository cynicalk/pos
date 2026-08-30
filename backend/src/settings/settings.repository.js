const db = require('../shared/db');

const getAll = (restaurantId) =>
  db
    .query('SELECT key, value FROM settings WHERE restaurant_id = $1', [restaurantId])
    .then((r) => Object.fromEntries(r.rows.map((row) => [row.key, row.value])));

const getValue = (restaurantId, key) =>
  db
    .query('SELECT value FROM settings WHERE restaurant_id = $1 AND key = $2', [restaurantId, key])
    .then((r) => r.rows[0]?.value ?? null);

const set = (restaurantId, key, value) =>
  db.query(
    `INSERT INTO settings (restaurant_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (restaurant_id, key) DO UPDATE SET value = $3`,
    [restaurantId, key, value],
  );

module.exports = { getAll, getValue, set };
