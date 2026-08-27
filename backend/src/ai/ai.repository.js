const db = require('../shared/db');

// Read queries backing the AI chatbot tools. Results are shaped for LLM context:
// compact aggregates with only the columns the model needs, never SELECT * dumps —
// every returned row is paid for in prompt tokens on each chat turn.

// Per-restaurant kill switch, controlled from the operator admin panel
const getAiEnabled = (restaurantId) =>
  db
    .query('SELECT ai_enabled FROM restaurants WHERE id = $1', [restaurantId])
    .then((r) => r.rows[0]?.ai_enabled !== false);

const getWasteSummary = (restaurantId, days = 7) =>
  db
    .query(
      `SELECT wl.reason,
              COUNT(*)::int        AS events,
              SUM(wl.total_cost)   AS total_cost
       FROM waste_logs wl
       WHERE wl.restaurant_id = $1
         AND wl.logged_at >= NOW() - make_interval(days => $2)
       GROUP BY wl.reason
       ORDER BY total_cost DESC`,
      [restaurantId, days],
    )
    .then((r) => r.rows);

const getTopWastedItems = (restaurantId, days = 7, limit = 10) =>
  db
    .query(
      `SELECT i.name               AS ingredient,
              i.unit,
              SUM(wl.quantity)     AS total_quantity,
              SUM(wl.total_cost)   AS total_cost,
              COUNT(*)::int        AS events
       FROM waste_logs wl
       JOIN ingredients i ON i.id = wl.ingredient_id
       WHERE wl.restaurant_id = $1
         AND wl.logged_at >= NOW() - make_interval(days => $2)
       GROUP BY i.id, i.name, i.unit
       ORDER BY total_cost DESC
       LIMIT $3`,
      [restaurantId, days, limit],
    )
    .then((r) => r.rows);

const getLowStock = (restaurantId) =>
  db
    .query(
      `SELECT name, unit, stock_on_hand, reorder_level, reorder_qty, latest_unit_cost, perishable
       FROM ingredients
       WHERE restaurant_id = $1 AND is_active = true AND stock_on_hand <= reorder_level
       ORDER BY (reorder_level - stock_on_hand) DESC`,
      [restaurantId],
    )
    .then((r) => r.rows);

const getInventoryMovements = (restaurantId, days = 7) =>
  db
    .query(
      `SELECT i.name                 AS ingredient,
              i.unit,
              it.txn_type,
              SUM(it.quantity_delta) AS total_delta,
              COUNT(*)::int          AS transactions
       FROM inventory_transactions it
       JOIN ingredients i ON i.id = it.ingredient_id
       WHERE it.restaurant_id = $1
         AND it.created_at >= NOW() - make_interval(days => $2)
       GROUP BY i.id, i.name, i.unit, it.txn_type
       ORDER BY i.name, it.txn_type`,
      [restaurantId, days],
    )
    .then((r) => r.rows);

const getRecipeCosts = (restaurantId, order = 'worst') =>
  db
    .query(
      `SELECT r.name                                   AS recipe,
              mi.name                                  AS menu_item,
              mi.price                                 AS selling_price,
              ROUND(SUM(ri.quantity * ri.cost_per_unit)::numeric, 2) AS recipe_cost,
              CASE WHEN mi.price > 0
                   THEN ROUND((SUM(ri.quantity * ri.cost_per_unit) / mi.price * 100)::numeric, 1)
              END                                      AS food_cost_pct
       FROM recipes r
       JOIN recipe_ingredients ri ON ri.recipe_id = r.id
       LEFT JOIN menu_items mi ON mi.recipe_id = r.id AND mi.restaurant_id = r.restaurant_id
       WHERE r.restaurant_id = $1
       GROUP BY r.id, r.name, mi.name, mi.price
       ORDER BY food_cost_pct ${order === 'best' ? 'ASC' : 'DESC'} NULLS LAST`,
      [restaurantId],
    )
    .then((r) => r.rows);

const getSalesVelocity = (restaurantId, days = 7, limit = 15) =>
  db
    .query(
      `SELECT mi.name,
              mi.category,
              SUM(oi.quantity)::int                              AS qty_sold,
              ROUND(SUM(oi.quantity * mi.price)::numeric, 2)     AS revenue,
              ROUND((SUM(oi.quantity) / $2::numeric), 1)         AS avg_per_day
       FROM order_items oi
       JOIN orders o      ON o.id = oi.order_id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.restaurant_id = $1
         AND o.status NOT IN ('cancelled')
         AND oi.status != 'cancelled'
         AND o.created_at >= NOW() - make_interval(days => $2::int)
       GROUP BY mi.id, mi.name, mi.category
       ORDER BY qty_sold DESC
       LIMIT $3`,
      [restaurantId, days, limit],
    )
    .then((r) => r.rows);

const getRecentOrders = (restaurantId, limit = 10) =>
  db
    .query(
      `SELECT o.order_ref,
              o.status,
              o.channel,
              o.created_at,
              COUNT(oi.id)::int                              AS item_count,
              ROUND(SUM(oi.quantity * mi.price)::numeric, 2) AS amount,
              string_agg(mi.name || ' ×' || oi.quantity, ', ' ORDER BY mi.name) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.status != 'cancelled'
       LEFT JOIN menu_items mi  ON mi.id = oi.menu_item_id
       WHERE o.restaurant_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT $2`,
      [restaurantId, limit],
    )
    .then((r) => r.rows);

// Menu browsing with filters applied in SQL — small local models are unreliable
// at filtering rows themselves, so price/category constraints must not be left
// to the model.
const getMenuItems = (restaurantId, { maxPrice, minPrice, category, nameContains } = {}) =>
  db
    .query(
      `SELECT name, category, price, available
       FROM menu_items
       WHERE restaurant_id = $1
         AND ($2::numeric IS NULL OR price <= $2::numeric)
         AND ($3::numeric IS NULL OR price >= $3::numeric)
         AND ($4::text IS NULL OR category ILIKE $4)
         AND ($5::text IS NULL OR name ILIKE '%' || $5 || '%')
       ORDER BY category, price
       LIMIT 100`,
      [restaurantId, maxPrice ?? null, minPrice ?? null, category ?? null, nameContains ?? null],
    )
    .then((r) => r.rows);

// Waste cost over a window ending `offsetDays` ago — call twice to compare
// this period against the previous one (delta badge on the waste card)
const getWasteTotal = (restaurantId, days = 7, offsetDays = 0) =>
  db
    .query(
      `SELECT COALESCE(SUM(total_cost), 0) AS total
       FROM waste_logs
       WHERE restaurant_id = $1
         AND logged_at >= NOW() - make_interval(days => ($2::int + $3::int))
         AND logged_at <  NOW() - make_interval(days => $3::int)`,
      [restaurantId, days, offsetDays],
    )
    .then((r) => Number(r.rows[0].total));

const getTables = (restaurantId) =>
  db
    .query(
      `SELECT number, status, seats
       FROM tables
       WHERE restaurant_id = $1
       ORDER BY number`,
      [restaurantId],
    )
    .then((r) => r.rows);

const getTableByNumber = (restaurantId, number) =>
  db
    .query(
      'SELECT id, number, status, seats FROM tables WHERE restaurant_id = $1 AND number = $2',
      [restaurantId, number],
    )
    .then((r) => r.rows[0]);

const getActiveOrders = (restaurantId) =>
  db
    .query(
      `SELECT o.id, o.order_ref, o.status, o.channel, t.number AS table_number,
              ROUND(SUM(oi.quantity * mi.price)::numeric, 2) AS amount,
              string_agg(mi.name || ' ×' || oi.quantity, ', ' ORDER BY mi.name) AS items
       FROM orders o
       LEFT JOIN tables t ON t.id = o.table_id
       LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.status != 'cancelled'
       LEFT JOIN menu_items mi  ON mi.id = oi.menu_item_id
       WHERE o.restaurant_id = $1 AND o.status NOT IN ('paid', 'cancelled')
       GROUP BY o.id, t.number
       ORDER BY o.created_at DESC`,
      [restaurantId],
    )
    .then((r) => r.rows);

// Resolves menu item names from the model to real rows (for order placement)
const findMenuItemsByName = (restaurantId, search) =>
  db
    .query(
      `SELECT id, name, price, category, available
       FROM menu_items
       WHERE restaurant_id = $1 AND name ILIKE '%' || $2 || '%'
       ORDER BY name
       LIMIT 5`,
      [restaurantId, search],
    )
    .then((r) => r.rows);

// Resolves the ingredient names the model produces ("paneer", "Tomatoes") to real
// rows — used by write tools (e.g. update_reorder_level) before asking the user
// to confirm.
const findIngredientsByName = (restaurantId, search) =>
  db
    .query(
      `SELECT id, name, unit, stock_on_hand, reorder_level
       FROM ingredients
       WHERE restaurant_id = $1 AND is_active = true AND name ILIKE '%' || $2 || '%'
       ORDER BY name
       LIMIT 5`,
      [restaurantId, search],
    )
    .then((r) => r.rows);

// ── Conversation persistence ────────────────────────────────────────────────
// Only user and assistant text is replayed as LLM history; role='tool' rows are
// an audit trail of confirmed write actions, not part of the prompt.

const saveMessage = ({ sessionId, restaurantId, userId, role, content, toolName, coversUntil }) =>
  db
    .query(
      `INSERT INTO ai_conversations (session_id, restaurant_id, user_id, role, content, tool_name, covers_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [sessionId, restaurantId, userId || null, role, content, toolName || null, coversUntil || null],
    )
    .then((r) => r.rows[0]);

// Latest compacted summary for the session (if any)
const getLatestSummary = (sessionId, restaurantId) =>
  db
    .query(
      `SELECT content, covers_until
       FROM ai_conversations
       WHERE session_id = $1 AND restaurant_id = $2 AND role = 'summary'
       ORDER BY created_at DESC
       LIMIT 1`,
      [sessionId, restaurantId],
    )
    .then((r) => r.rows[0]);

// Chat tail: user/assistant messages after the summary boundary (or all, when
// the session has never been compacted)
const getMessagesSince = (sessionId, restaurantId, since, limit = 30) =>
  db
    .query(
      `SELECT role, content, created_at FROM (
         SELECT role, content, created_at
         FROM ai_conversations
         WHERE session_id = $1 AND restaurant_id = $2 AND role IN ('user', 'assistant')
           AND ($3::timestamptz IS NULL OR created_at > $3::timestamptz)
         ORDER BY created_at DESC
         LIMIT $4
       ) recent ORDER BY created_at ASC`,
      [sessionId, restaurantId, since || null, limit],
    )
    .then((r) => r.rows);

module.exports = {
  getAiEnabled,
  getWasteSummary,
  getTopWastedItems,
  getLowStock,
  getInventoryMovements,
  getRecipeCosts,
  getSalesVelocity,
  getRecentOrders,
  getMenuItems,
  getWasteTotal,
  getTables,
  getTableByNumber,
  getActiveOrders,
  findMenuItemsByName,
  findIngredientsByName,
  saveMessage,
  getLatestSummary,
  getMessagesSince,
};
