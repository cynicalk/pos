const db = require('../shared/db');

const findByPhone = (restaurantId, phone) =>
  db.query(
    'SELECT * FROM loyalty_customers WHERE restaurant_id = $1 AND phone = $2',
    [restaurantId, phone],
  ).then((r) => r.rows[0] || null);

const findById = (restaurantId, id) =>
  db.query(
    'SELECT * FROM loyalty_customers WHERE restaurant_id = $1 AND id = $2',
    [restaurantId, id],
  ).then((r) => r.rows[0] || null);

const findOrCreate = async (restaurantId, phone, name) => {
  const res = await db.query(
    `INSERT INTO loyalty_customers (restaurant_id, phone, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (restaurant_id, phone) DO UPDATE SET name = COALESCE(EXCLUDED.name, loyalty_customers.name)
     RETURNING *`,
    [restaurantId, phone, name || null],
  );
  return res.rows[0];
};

const list = (restaurantId, { search = '', limit = 50, offset = 0 } = {}) => {
  const like = `%${search}%`;
  return db.query(
    `SELECT lc.*,
       (SELECT lt.name FROM loyalty_tiers lt
          WHERE lt.restaurant_id = lc.restaurant_id
            AND lc.points_balance >= lt.min_points
          ORDER BY lt.min_points DESC LIMIT 1) AS tier
     FROM loyalty_customers lc
     WHERE lc.restaurant_id = $1 AND ($2 = '' OR lc.phone ILIKE $3 OR lc.name ILIKE $3)
     ORDER BY lc.created_at DESC LIMIT $4 OFFSET $5`,
    [restaurantId, search, like, limit, offset],
  ).then((r) => r.rows);
};

const getTransactions = (restaurantId, customerId, { limit = 30, offset = 0 } = {}) =>
  db.query(
    `SELECT * FROM loyalty_transactions
     WHERE restaurant_id = $1 AND customer_id = $2
     ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
    [restaurantId, customerId, limit, offset],
  ).then((r) => r.rows);

// Add a ledger row and update the customer balance atomically. Accepts an
// optional transaction `client` so settlement can join the caller's transaction
// (e.g. the payment tx); without one it opens its own transaction.
const addTransaction = (restaurantId, payload, client) =>
  client ? _addTransaction(client, restaurantId, payload)
         : db.withTransaction((c) => _addTransaction(c, restaurantId, payload));

const _addTransaction = async (client, restaurantId, { customerId, orderId, type, points, description }) => {
  await client.query(
    `INSERT INTO loyalty_transactions (restaurant_id, customer_id, order_id, type, points, description)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [restaurantId, customerId, orderId || null, type, points, description || null],
  );
  const res = await client.query(
    'UPDATE loyalty_customers SET points_balance = points_balance + $1 WHERE id = $2 RETURNING *',
    [points, customerId],
  );
  return res.rows[0];
};

const remove = (restaurantId, id) =>
  db.query(
    'DELETE FROM loyalty_customers WHERE restaurant_id = $1 AND id = $2 RETURNING *',
    [restaurantId, id],
  ).then((r) => r.rows[0] || null);

const updateName = (restaurantId, id, name) =>
  db.query(
    'UPDATE loyalty_customers SET name = $1 WHERE restaurant_id = $2 AND id = $3 RETURNING *',
    [name, restaurantId, id],
  ).then((r) => r.rows[0] || null);

// --- Tiers ---

const listTiers = (restaurantId) =>
  db.query(
    'SELECT * FROM loyalty_tiers WHERE restaurant_id = $1 ORDER BY sort_order, min_points',
    [restaurantId],
  ).then((r) => r.rows);

const replaceTiers = (restaurantId, tiers) =>
  db.withTransaction(async (client) => {
    await client.query('DELETE FROM loyalty_tiers WHERE restaurant_id = $1', [restaurantId]);
    for (let i = 0; i < tiers.length; i++) {
      const { name, min_points, color } = tiers[i];
      await client.query(
        `INSERT INTO loyalty_tiers (restaurant_id, name, min_points, color, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [restaurantId, name, min_points ?? 0, color || null, i],
      );
    }
    const { rows } = await client.query(
      'SELECT * FROM loyalty_tiers WHERE restaurant_id = $1 ORDER BY sort_order, min_points',
      [restaurantId],
    );
    return rows;
  });

// --- Rewards ---

const listRewards = (restaurantId) =>
  db.query(
    'SELECT * FROM loyalty_rewards WHERE restaurant_id = $1 ORDER BY sort_order, id',
    [restaurantId],
  ).then((r) => r.rows);

const replaceRewards = (restaurantId, rewards) =>
  db.withTransaction(async (client) => {
    await client.query('DELETE FROM loyalty_rewards WHERE restaurant_id = $1', [restaurantId]);
    for (let i = 0; i < rewards.length; i++) {
      const { name, description, icon, points_cost, is_active } = rewards[i];
      await client.query(
        `INSERT INTO loyalty_rewards (restaurant_id, name, description, icon, points_cost, is_active, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [restaurantId, name, description || null, icon || '%', points_cost, is_active !== false, i],
      );
    }
    const { rows } = await client.query(
      'SELECT * FROM loyalty_rewards WHERE restaurant_id = $1 ORDER BY sort_order, id',
      [restaurantId],
    );
    return rows;
  });

module.exports = {
  findByPhone, findById, findOrCreate, list, getTransactions, addTransaction, remove, updateName,
  listTiers, replaceTiers, listRewards, replaceRewards,
};
