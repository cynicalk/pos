const db = require('../shared/db');

const getAll = (restaurantId, { status } = {}) =>
  db.query(
    `SELECT wr.*, u.name AS reviewed_by_name
     FROM wastage_reviews wr
     LEFT JOIN users u ON u.id = wr.reviewed_by
     WHERE wr.restaurant_id = $1
       AND ($2::text IS NULL OR wr.status = $2)
     ORDER BY wr.created_at DESC`,
    [restaurantId, status || null],
  ).then((r) => r.rows);

const getById = (id, restaurantId) =>
  db.query(
    'SELECT * FROM wastage_reviews WHERE id = $1 AND restaurant_id = $2',
    [id, restaurantId],
  ).then((r) => r.rows[0]);

const create = ({ restaurantId, orderId, orderItemId, menuItemId, menuItemName, quantity, cancelReason, ingredients }) =>
  db.query(
    `INSERT INTO wastage_reviews
       (restaurant_id, order_id, order_item_id, menu_item_id, menu_item_name, quantity, cancel_reason, ingredients)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [restaurantId, orderId, orderItemId, menuItemId, menuItemName, quantity, cancelReason || null, JSON.stringify(ingredients)],
  ).then((r) => r.rows[0]);

const resolve = (id, { reviewedBy, ingredients }) =>
  db.query(
    `UPDATE wastage_reviews
     SET status = 'reviewed', reviewed_by = $2, reviewed_at = NOW(), ingredients = $3
     WHERE id = $1 RETURNING *`,
    [id, reviewedBy || null, JSON.stringify(ingredients)],
  ).then((r) => r.rows[0]);

module.exports = { getAll, getById, create, resolve };
