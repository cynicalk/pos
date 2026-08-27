const db = require('../shared/db');

// Suppliers, purchase orders, invoice intake and ingredient price history.
// Every query is tenant-scoped on restaurant_id.

// ── Suppliers ──────────────────────────────────────────────────────────────

const listSuppliers = (restaurantId) =>
  db.query(`
    SELECT s.*,
           (SELECT COUNT(*)::int FROM ingredients i WHERE i.supplier_id = s.id) AS ingredient_count
    FROM suppliers s
    WHERE s.restaurant_id = $1
    ORDER BY s.is_active DESC, s.name
  `, [restaurantId]).then((r) => r.rows);

const createSupplier = (restaurantId, { name, phone, leadTimeDays }) =>
  db.query(
    `INSERT INTO suppliers (restaurant_id, name, phone, lead_time_days)
     VALUES ($1, $2, $3, COALESCE($4, 2)) RETURNING *`,
    [restaurantId, name, phone || null, leadTimeDays ?? null],
  ).then((r) => r.rows[0]);

const updateSupplier = (id, restaurantId, { name, phone, leadTimeDays, isActive }) =>
  db.query(
    `UPDATE suppliers
     SET name           = COALESCE($3, name),
         phone          = COALESCE($4, phone),
         lead_time_days = COALESCE($5, lead_time_days),
         is_active      = COALESCE($6, is_active),
         updated_at     = now()
     WHERE id = $1 AND restaurant_id = $2 RETURNING *`,
    [id, restaurantId, name ?? null, phone ?? null, leadTimeDays ?? null, isActive ?? null],
  ).then((r) => r.rows[0]);

const assignIngredient = (ingredientId, restaurantId, supplierId) =>
  db.query(
    `UPDATE ingredients SET supplier_id = $3
     WHERE id = $1 AND restaurant_id = $2 RETURNING *`,
    [ingredientId, restaurantId, supplierId || null],
  ).then((r) => r.rows[0]);

// ── Reorder / suggestion inputs ────────────────────────────────────────────

/**
 * Every active ingredient with its stock, supplier lead time and observed daily
 * usage over the consumption window.
 *
 * Usage comes from the inventory ledger rather than from recipe explosion: the
 * ledger already records what each sale consumed, so it reflects what the
 * kitchen actually used including waste-free corrections. `txn_type` values
 * that REMOVE stock have a negative delta, so usage is the negated sum of them.
 */
const getReorderInputs = (restaurantId, consumptionDays) =>
  db.query(`
    SELECT
      i.id, i.name, i.unit, i.stock_on_hand, i.latest_unit_cost,
      i.reorder_level, i.supplier_id,
      s.name           AS supplier_name,
      COALESCE(s.lead_time_days, 2) AS lead_time_days,
      COALESCE((
        SELECT SUM(-t.quantity_delta) / GREATEST($2, 1)
        FROM inventory_transactions t
        WHERE t.ingredient_id = i.id
          AND t.restaurant_id = $1
          AND t.quantity_delta < 0
          AND t.created_at >= now() - make_interval(days => $2)
      ), 0) AS daily_usage
    FROM ingredients i
    LEFT JOIN suppliers s ON s.id = i.supplier_id
    WHERE i.restaurant_id = $1 AND i.is_active = true
    ORDER BY i.name
  `, [restaurantId, consumptionDays]).then((r) => r.rows);

// ── Purchase orders ────────────────────────────────────────────────────────

const listPurchaseOrders = (restaurantId, status) =>
  db.query(`
    SELECT po.*, s.name AS supplier_name
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.restaurant_id = $1
      AND ($2::text IS NULL OR po.status = $2)
    ORDER BY po.created_at DESC
    LIMIT 200
  `, [restaurantId, status || null]).then((r) => r.rows);

const getPurchaseOrder = (id, restaurantId) =>
  db.query(
    `SELECT po.*, s.name AS supplier_name
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     WHERE po.id = $1 AND po.restaurant_id = $2`,
    [id, restaurantId],
  ).then((r) => r.rows[0]);

const createPurchaseOrder = (restaurantId, { supplierId, lines, total, notes, createdBy }) =>
  db.query(
    `INSERT INTO purchase_orders (restaurant_id, supplier_id, lines, total, notes, created_by)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6) RETURNING *`,
    [restaurantId, supplierId, JSON.stringify(lines), total, notes || null, createdBy || null],
  ).then((r) => r.rows[0]);

const setPurchaseOrderStatus = (id, restaurantId, status) =>
  db.query(
    `UPDATE purchase_orders
     SET status      = $3::text,
         received_at = CASE WHEN $3::text = 'received' THEN now() ELSE NULL END,
         updated_at  = now()
     WHERE id = $1 AND restaurant_id = $2 RETURNING *`,
    [id, restaurantId, status],
  ).then((r) => r.rows[0]);

// ── Price history ──────────────────────────────────────────────────────────

const getPriceHistory = (ingredientId, restaurantId, limit = 50) =>
  db.query(
    `SELECT cost_per_unit, source, recorded_at
     FROM ingredient_prices
     WHERE ingredient_id = $1 AND restaurant_id = $2
     ORDER BY recorded_at DESC LIMIT $3`,
    [ingredientId, restaurantId, limit],
  ).then((r) => r.rows);

/**
 * The two most recent prices per ingredient — the input the cost_spike rule
 * compares. Baseline rows are included: a jump away from the opening cost is a
 * real price change worth knowing about.
 */
const getLatestPricePairs = (restaurantId) =>
  db.query(`
    SELECT ingredient_id, name, unit, costs[1] AS current_cost, costs[2] AS previous_cost,
           recorded[1] AS recorded_at
    FROM (
      SELECT p.ingredient_id, i.name, i.unit,
             (array_agg(p.cost_per_unit ORDER BY p.recorded_at DESC))[1:2] AS costs,
             (array_agg(p.recorded_at   ORDER BY p.recorded_at DESC))[1:2] AS recorded
      FROM ingredient_prices p
      JOIN ingredients i ON i.id = p.ingredient_id
      WHERE p.restaurant_id = $1
      GROUP BY p.ingredient_id, i.name, i.unit
    ) t
    WHERE array_length(costs, 1) = 2
  `, [restaurantId]).then((r) => r.rows);

const findIngredientsByName = (restaurantId, names) =>
  db.query(
    `SELECT id, name, unit, latest_unit_cost FROM ingredients
     WHERE restaurant_id = $1 AND lower(name) = ANY($2::text[])`,
    [restaurantId, names.map((n) => n.toLowerCase())],
  ).then((r) => r.rows);

/** Dishes whose recipe uses an ingredient — for naming what a price spike hit. */
const getDishesUsing = (ingredientId, restaurantId) =>
  db.query(`
    SELECT DISTINCT mi.name
    FROM recipe_ingredients ri
    JOIN recipes r    ON r.id = ri.recipe_id
    JOIN menu_items mi ON mi.recipe_id = r.id
    WHERE ri.ingredient_id = $1 AND r.restaurant_id = $2
    ORDER BY mi.name
    LIMIT 5
  `, [ingredientId, restaurantId]).then((r) => r.rows.map((x) => x.name));

module.exports = {
  listSuppliers, createSupplier, updateSupplier, assignIngredient,
  getReorderInputs,
  listPurchaseOrders, getPurchaseOrder, createPurchaseOrder, setPurchaseOrderStatus,
  getPriceHistory, getLatestPricePairs, findIngredientsByName, getDishesUsing,
};
