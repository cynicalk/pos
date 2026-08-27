const db = require('../shared/db');

const getAll = (restaurantId) =>
  db
    .query(
      'SELECT * FROM menu_items WHERE restaurant_id = $1 AND archived_at IS NULL ORDER BY category, name',
      [restaurantId],
    )
    .then((r) => r.rows);

const getAvailable = (restaurantId) =>
  db
    .query(
      'SELECT * FROM menu_items WHERE restaurant_id = $1 AND available = true AND archived_at IS NULL ORDER BY category, name',
      [restaurantId],
    )
    .then((r) => r.rows);

const getById = (id, restaurantId) =>
  db
    .query('SELECT * FROM menu_items WHERE id = $1 AND restaurant_id = $2', [id, restaurantId])
    .then((r) => r.rows[0]);

const create = ({ name, price, category, sku, restaurantId, customizationGroups, recipeId, description }) =>
  db
    .query(
      'INSERT INTO menu_items (name, price, category, sku, restaurant_id, customization_groups, recipe_id, description) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [name, price, category, sku || null, restaurantId, JSON.stringify(customizationGroups || []), recipeId || null, description || null],
    )
    .then((r) => r.rows[0]);

const update = (id, { name, price, category, available, sku, customizationGroups, recipeId, description }, restaurantId) =>
  db
    .query(
      `UPDATE menu_items
       SET name                 = COALESCE($1, name),
           price                = COALESCE($2, price),
           category             = COALESCE($3, category),
           available            = COALESCE($4, available),
           sku                  = COALESCE($5, sku),
           customization_groups = COALESCE($6, customization_groups),
           recipe_id            = CASE WHEN $7::boolean THEN $8::uuid ELSE recipe_id END,
           description          = CASE WHEN $9::boolean THEN $10 ELSE description END
       WHERE id = $11 AND restaurant_id = $12
       RETURNING *`,
      [name, price, category, available, sku || null,
       customizationGroups !== undefined ? JSON.stringify(customizationGroups) : null,
       recipeId !== undefined, recipeId || null,
       description !== undefined, description || null,
       id, restaurantId],
    )
    .then((r) => r.rows[0]);

// Soft-delete: archived items disappear from menus and the orderable list but stay
// in the table so historical order_items (and their FK) remain intact.
const remove = (id, restaurantId) =>
  db
    .query(
      'UPDATE menu_items SET archived_at = NOW(), available = false WHERE id = $1 AND restaurant_id = $2 AND archived_at IS NULL RETURNING *',
      [id, restaurantId],
    )
    .then((r) => r.rows[0]);

const getPopular = (restaurantId, limit = 6) =>
  db
    .query(
      `SELECT mi.*
       FROM menu_items mi
       INNER JOIN order_items oi ON oi.menu_item_id = mi.id
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE mi.restaurant_id = $1
         AND mi.available = true
         AND mi.archived_at IS NULL
         AND o.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY mi.id
       ORDER BY SUM(oi.quantity) DESC
       LIMIT $2`,
      [restaurantId, limit],
    )
    .then((r) => r.rows);

module.exports = { getAll, getAvailable, getById, create, update, remove, getPopular };
