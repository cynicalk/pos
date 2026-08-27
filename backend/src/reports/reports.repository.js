const db = require('../shared/db');

// Reports is READ-ONLY — never writes to any table

const VALID_GROUPS = new Set(['day', 'week', 'month']);
function assertGroup(g) {
  if (!VALID_GROUPS.has(g)) throw new Error(`Invalid group: ${g}`);
  return g;
}

// NULL channel = all channels; a specific value filters to that channel only.
// Pattern used throughout: AND ($N::text IS NULL OR o.channel = $N)

const getDailySummary = (date, tz = 'UTC', restaurantId, channel = null) =>
  db.query(`
    SELECT
      COUNT(DISTINCT o.id)                                                               AS total_orders,
      COALESCE(SUM(p.amount), 0)                                                         AS total_revenue,
      COUNT(DISTINCT CASE WHEN o.loyalty_customer_id IS NOT NULL THEN o.id END)          AS returning_orders,
      COUNT(DISTINCT CASE WHEN o.loyalty_customer_id IS NULL     THEN o.id END)          AS new_orders,
      COALESCE(AVG(EXTRACT(EPOCH FROM (p.created_at - o.created_at)) / 60.0), 0)         AS avg_serve_minutes
    FROM orders o
    JOIN payments p ON p.order_id = o.id
    WHERE (o.created_at AT TIME ZONE $2)::date = $1
      AND p.status = 'completed'
      AND o.restaurant_id = $3
      AND ($4::text IS NULL OR o.channel = $4)
  `, [date, tz, restaurantId, channel])
  .then((r) => r.rows[0]);

const getDailyCancelled = (date, tz = 'UTC', restaurantId, channel = null) =>
  db.query(`
    SELECT COUNT(*)::int AS cancelled_orders
    FROM orders
    WHERE (created_at AT TIME ZONE $2)::date = $1
      AND status = 'cancelled'
      AND restaurant_id = $3
      AND ($4::text IS NULL OR channel = $4)
  `, [date, tz, restaurantId, channel])
  .then((r) => r.rows[0]);

const getRevenueByCategory = (date, tz = 'UTC', restaurantId, channel = null) =>
  db.query(`
    SELECT
      mi.category,
      COUNT(oi.id)                    AS items_sold,
      SUM(mi.price * oi.quantity)     AS revenue
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    JOIN orders o      ON o.id = oi.order_id
    JOIN payments p    ON p.order_id = o.id
    WHERE (o.created_at AT TIME ZONE $2)::date = $1
      AND p.status = 'completed'
      AND o.restaurant_id = $3
      AND ($4::text IS NULL OR o.channel = $4)
    GROUP BY mi.category
    ORDER BY revenue DESC
  `, [date, tz, restaurantId, channel])
  .then((r) => r.rows);

const getTopItems = (date, tz = 'UTC', limit = 10, restaurantId, channel = null) =>
  db.query(`
    SELECT
      mi.name,
      mi.category,
      SUM(oi.quantity)                AS total_sold,
      SUM(mi.price * oi.quantity)     AS revenue
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    JOIN orders o      ON o.id = oi.order_id
    JOIN payments p    ON p.order_id = o.id
    WHERE (o.created_at AT TIME ZONE $2)::date = $1
      AND p.status = 'completed'
      AND o.restaurant_id = $4
      AND ($5::text IS NULL OR o.channel = $5)
    GROUP BY mi.id, mi.name, mi.category
    ORDER BY total_sold DESC
    LIMIT $3
  `, [date, tz, limit, restaurantId, channel])
  .then((r) => r.rows);

const getHourlySales = (date, tz = 'UTC', restaurantId, channel = null) =>
  db.query(`
    SELECT
      EXTRACT(HOUR FROM o.created_at AT TIME ZONE $2)::int AS hour,
      COUNT(DISTINCT o.id)                                  AS orders,
      COALESCE(SUM(p.amount), 0)                            AS revenue
    FROM orders o
    JOIN payments p ON p.order_id = o.id
    WHERE (o.created_at AT TIME ZONE $2)::date = $1
      AND p.status = 'completed'
      AND o.restaurant_id = $3
      AND ($4::text IS NULL OR o.channel = $4)
    GROUP BY hour
    ORDER BY hour
  `, [date, tz, restaurantId, channel])
  .then((r) => r.rows);

// ── Range-based queries ───────────────────────────────────────────────────────

const getTrends = (from, to, tz = 'UTC', group, restaurantId, channel = null) => {
  assertGroup(group);
  return db.query(`
    SELECT
      date_trunc($5, o.created_at AT TIME ZONE $3)::date::text AS period,
      COUNT(DISTINCT o.id)::int                                  AS orders,
      COALESCE(SUM(p.amount), 0)                                 AS revenue
    FROM orders o
    JOIN payments p ON p.order_id = o.id
    WHERE (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
      AND p.status = 'completed'
      AND o.restaurant_id = $4
      AND ($6::text IS NULL OR o.channel = $6)
    GROUP BY 1
    ORDER BY 1
  `, [from, to, tz, restaurantId, group, channel])
  .then((r) => r.rows);
};

const getItemProfitability = (from, to, tz = 'UTC', limit = 50, restaurantId, channel = null) =>
  db.query(`
    SELECT
      mi.id,
      mi.name,
      mi.category,
      mi.price                              AS selling_price,
      SUM(oi.quantity)::int                 AS total_sold,
      SUM(mi.price * oi.quantity)           AS revenue,
      (
        SELECT COALESCE(SUM(ri.quantity * ri.cost_per_unit), 0)
        FROM recipe_ingredients ri
        WHERE ri.recipe_id = mi.recipe_id
      )                                     AS cost_per_unit
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    JOIN orders o      ON o.id = oi.order_id
    JOIN payments p    ON p.order_id = o.id
    WHERE (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
      AND p.status = 'completed'
      AND o.restaurant_id = $4
      AND ($6::text IS NULL OR o.channel = $6)
    GROUP BY mi.id, mi.name, mi.category, mi.price
    ORDER BY revenue DESC
    LIMIT $5
  `, [from, to, tz, restaurantId, limit, channel])
  .then((r) => r.rows);

const getStaffPerformance = (from, to, tz = 'UTC', restaurantId, channel = null) =>
  db.query(`
    SELECT
      u.id,
      COALESCE(u.name, u.email)             AS name,
      u.email,
      u.role,
      COUNT(DISTINCT o.id)::int             AS orders_created,
      COALESCE(SUM(p.amount), 0)            AS revenue_handled
    FROM users u
    LEFT JOIN orders o ON o.created_by = u.id
      AND (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
      AND ($5::text IS NULL OR o.channel = $5)
    LEFT JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
    WHERE u.restaurant_id = $4
      AND u.is_active = true
      AND u.role IN ('admin', 'staff', 'cashier')
    GROUP BY u.id, u.name, u.email, u.role
    ORDER BY revenue_handled DESC
  `, [from, to, tz, restaurantId, channel])
  .then((r) => r.rows);

const getItemsByPeriod = (from, to, tz = 'UTC', group, limit = 8, restaurantId, channel = null) => {
  assertGroup(group);
  return db.query(`
    WITH top_items AS (
      SELECT mi.id
      FROM order_items oi
      JOIN menu_items mi ON mi.id = oi.menu_item_id
      JOIN orders o      ON o.id  = oi.order_id
      JOIN payments p    ON p.order_id = o.id
      WHERE (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
        AND p.status = 'completed'
        AND o.restaurant_id = $4
        AND ($7::text IS NULL OR o.channel = $7)
      GROUP BY mi.id
      ORDER BY SUM(mi.price * oi.quantity) DESC
      LIMIT $5
    )
    SELECT
      date_trunc($6, o.created_at AT TIME ZONE $3)::date::text AS period,
      mi.name,
      SUM(oi.quantity)::int                AS total_sold,
      SUM(mi.price * oi.quantity)          AS revenue
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id AND mi.id IN (SELECT id FROM top_items)
    JOIN orders o      ON o.id  = oi.order_id
    JOIN payments p    ON p.order_id = o.id
    WHERE (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
      AND p.status = 'completed'
      AND o.restaurant_id = $4
      AND ($7::text IS NULL OR o.channel = $7)
    GROUP BY 1, mi.name
    ORDER BY 1, revenue DESC
  `, [from, to, tz, restaurantId, limit, group, channel])
  .then((r) => r.rows);
};

const getStaffByPeriod = (from, to, tz = 'UTC', group, restaurantId, channel = null) => {
  assertGroup(group);
  return db.query(`
    SELECT
      date_trunc($5, o.created_at AT TIME ZONE $3)::date::text AS period,
      COALESCE(u.name, u.email)              AS name,
      COUNT(DISTINCT o.id)::int              AS orders_created,
      COALESCE(SUM(p.amount), 0)             AS revenue_handled
    FROM users u
    JOIN orders o   ON o.created_by = u.id
      AND (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
      AND ($6::text IS NULL OR o.channel = $6)
    JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
    WHERE u.restaurant_id = $4
      AND u.is_active = true
      AND u.role IN ('admin', 'staff', 'cashier')
    GROUP BY 1, u.id, u.name, u.email
    ORDER BY 1, revenue_handled DESC
  `, [from, to, tz, restaurantId, group, channel])
  .then((r) => r.rows);
};

// ── Summary / collection / group queries ─────────────────────────────────────

const getSalesSummary = (from, to, tz = 'UTC', restaurantId, channel = null) =>
  db.query(`
    SELECT
      COUNT(DISTINCT o.id)::int          AS total_orders,
      COALESCE(SUM(p.total_charged), 0)  AS total_revenue,
      COALESCE(SUM(p.subtotal), 0)       AS subtotal,
      COALESCE(SUM(p.tax_amount), 0)     AS tax_amount,
      COALESCE(SUM(p.service_charge_amount), 0) AS service_charge,
      COALESCE(SUM(p.discount_amount), 0)        AS discount_amount,
      COALESCE(SUM(p.coupon_discount_amount), 0) AS coupon_discount_amount,
      COALESCE(SUM(p.loyalty_discount_amount), 0) AS loyalty_discount_amount,
      COALESCE(SUM(p.packaging_fee), 0)  AS packaging_fee,
      (
        SELECT COALESCE(SUM(oi2.quantity), 0)::int
        FROM order_items oi2
        JOIN orders o2 ON o2.id = oi2.order_id
        JOIN payments p2 ON p2.order_id = o2.id
        WHERE (o2.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
          AND p2.status = 'completed'
          AND o2.restaurant_id = $4
          AND ($5::text IS NULL OR o2.channel = $5)
      ) AS total_items_sold
    FROM orders o
    JOIN payments p ON p.order_id = o.id
    WHERE (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
      AND p.status = 'completed'
      AND o.restaurant_id = $4
      AND ($5::text IS NULL OR o.channel = $5)
  `, [from, to, tz, restaurantId, channel])
  .then((r) => r.rows[0]);

// Always shows all channels — filtering by channel would collapse this to one row
const getRevenueByChannel = (from, to, tz = 'UTC', restaurantId) =>
  db.query(`
    SELECT
      o.channel,
      COUNT(DISTINCT o.id)::int        AS orders,
      COALESCE(SUM(p.total_charged), 0) AS revenue,
      COALESCE(AVG(p.total_charged), 0) AS avg_order_value
    FROM orders o
    JOIN payments p ON p.order_id = o.id
    WHERE (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
      AND p.status = 'completed'
      AND o.restaurant_id = $4
    GROUP BY o.channel
    ORDER BY revenue DESC
  `, [from, to, tz, restaurantId])
  .then((r) => r.rows);

const getCollectionByMethod = (from, to, tz = 'UTC', restaurantId, channel = null) =>
  db.query(`
    SELECT
      p.method,
      COUNT(DISTINCT o.id)::int        AS orders,
      COALESCE(SUM(p.total_charged), 0) AS amount
    FROM orders o
    JOIN payments p ON p.order_id = o.id
    WHERE (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
      AND p.status = 'completed'
      AND o.restaurant_id = $4
      AND ($5::text IS NULL OR o.channel = $5)
    GROUP BY p.method
    ORDER BY amount DESC
  `, [from, to, tz, restaurantId, channel])
  .then((r) => r.rows);

const getCollectionByCounter = (from, to, tz = 'UTC', restaurantId, channel = null) =>
  db.query(`
    SELECT
      COALESCE(u.name, u.email)          AS counter_name,
      u.email,
      u.role,
      COUNT(DISTINCT o.id)::int          AS orders,
      COALESCE(SUM(p.total_charged), 0)  AS amount
    FROM orders o
    JOIN payments p ON p.order_id = o.id
    JOIN users u ON u.id = o.created_by
    WHERE (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
      AND p.status = 'completed'
      AND o.restaurant_id = $4
      AND ($5::text IS NULL OR o.channel = $5)
    GROUP BY u.id, u.name, u.email, u.role
    ORDER BY amount DESC
  `, [from, to, tz, restaurantId, channel])
  .then((r) => r.rows);

const getRevenueByItemGroup = (from, to, tz = 'UTC', restaurantId, channel = null) =>
  db.query(`
    SELECT
      COALESCE(mi.category, 'Uncategorized') AS item_group,
      COUNT(DISTINCT o.id)::int               AS orders,
      COALESCE(SUM(oi.quantity), 0)::int      AS items_sold,
      COALESCE(SUM(mi.price * oi.quantity), 0) AS revenue
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    JOIN orders o      ON o.id  = oi.order_id
    JOIN payments p    ON p.order_id = o.id
    WHERE (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
      AND p.status = 'completed'
      AND o.restaurant_id = $4
      AND ($5::text IS NULL OR o.channel = $5)
    GROUP BY mi.category
    ORDER BY revenue DESC
  `, [from, to, tz, restaurantId, channel])
  .then((r) => r.rows);

const getTopSellingItems = (from, to, tz = 'UTC', limit = 50, restaurantId, channel = null) =>
  db.query(`
    SELECT
      mi.id,
      mi.name,
      mi.category,
      COALESCE(SUM(oi.quantity), 0)::int        AS total_sold,
      COALESCE(SUM(mi.price * oi.quantity), 0)  AS revenue
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    JOIN orders o      ON o.id  = oi.order_id
    JOIN payments p    ON p.order_id = o.id
    WHERE (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
      AND p.status = 'completed'
      AND o.restaurant_id = $4
      AND ($6::text IS NULL OR o.channel = $6)
    GROUP BY mi.id, mi.name, mi.category
    ORDER BY total_sold DESC
    LIMIT $5
  `, [from, to, tz, restaurantId, limit, channel])
  .then((r) => r.rows);

// Tables report is inherently dine-in — channel filter not applicable
const getTableWiseSales = (from, to, tz = 'UTC', restaurantId) =>
  db.query(`
    SELECT
      t.number::text                     AS table_number,
      COUNT(DISTINCT o.id)::int          AS orders,
      COALESCE(SUM(p.total_charged), 0)  AS revenue,
      COALESCE(AVG(p.total_charged), 0)  AS avg_order_value
    FROM orders o
    JOIN tables t   ON t.id = o.table_id
    JOIN payments p ON p.order_id = o.id
    WHERE (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
      AND p.status = 'completed'
      AND o.channel = 'dining'
      AND o.restaurant_id = $4
    GROUP BY t.id, t.number
    ORDER BY revenue DESC
  `, [from, to, tz, restaurantId])
  .then((r) => r.rows);

const getNCSales = (from, to, tz = 'UTC', restaurantId, channel = null) =>
  db.query(`
    SELECT
      o.id,
      o.channel,
      o.created_at,
      o.status,
      COALESCE(u.name, u.email) AS created_by,
      t.number::text            AS table_number,
      COALESCE((
        SELECT SUM(mi2.price * oi2.quantity)
        FROM order_items oi2
        JOIN menu_items mi2 ON mi2.id = oi2.menu_item_id
        WHERE oi2.order_id = o.id
      ), 0) AS order_value
    FROM orders o
    LEFT JOIN users u  ON u.id  = o.created_by
    LEFT JOIN tables t ON t.id  = o.table_id
    WHERE (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
      AND o.status = 'cancelled'
      AND o.restaurant_id = $4
      AND ($5::text IS NULL OR o.channel = $5)
    ORDER BY o.created_at DESC
  `, [from, to, tz, restaurantId, channel])
  .then((r) => r.rows);

// ── Food-cost variance (theoretical vs actual) ───────────────────────────────
// The window is bounded by two finalized stock counts' timestamps (t0, t1].

// Theoretical ingredient usage: recipe quantity × units sold (paid orders),
// rolled up to ingredient. Mirrors inventory.service's recipe-stock explosion
// (menu_items.recipe_id → recipe_ingredients) so theoretical matches what the
// ledger deducts.
const getTheoreticalUsage = (restaurantId, t0, t1) =>
  db.query(`
    SELECT ri.ingredient_id, SUM(oi.quantity * ri.quantity) AS theo_qty
    FROM order_items oi
    JOIN orders o            ON o.id = oi.order_id
    JOIN payments p          ON p.order_id = o.id AND p.status = 'completed'
    JOIN menu_items mi       ON mi.id = oi.menu_item_id
    JOIN recipe_ingredients ri ON ri.recipe_id = mi.recipe_id
    WHERE o.restaurant_id = $1
      AND o.created_at > $2 AND o.created_at <= $3
      AND oi.status <> 'cancelled'
    GROUP BY ri.ingredient_id
  `, [restaurantId, t0, t1]).then((r) => r.rows);

// Purchases in the window: quantity received and weighted-average actual price.
const getPurchasesByIngredient = (restaurantId, t0, t1) =>
  db.query(`
    SELECT ingredient_id,
           SUM(quantity_delta) AS purch_qty,
           CASE WHEN SUM(quantity_delta) > 0
                THEN SUM(quantity_delta * unit_cost) / SUM(quantity_delta) END AS avg_cost
    FROM inventory_transactions
    WHERE restaurant_id = $1 AND txn_type = 'PURCHASE'
      AND created_at > $2 AND created_at <= $3
    GROUP BY ingredient_id
  `, [restaurantId, t0, t1]).then((r) => r.rows);

const getSalesTotal = (restaurantId, t0, t1) =>
  db.query(`
    SELECT COALESCE(SUM(p.total_charged), 0) AS total_sales
    FROM orders o
    JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
    WHERE o.restaurant_id = $1 AND o.created_at > $2 AND o.created_at <= $3
  `, [restaurantId, t0, t1]).then((r) => parseFloat(r.rows[0].total_sales));

const getLatestFinalizedCountBefore = (restaurantId, ts) =>
  db.query(`
    SELECT * FROM stock_counts
    WHERE restaurant_id = $1 AND status = 'finalized' AND counted_at < $2
    ORDER BY counted_at DESC LIMIT 1
  `, [restaurantId, ts]).then((r) => r.rows[0] || null);

module.exports = {
  getTheoreticalUsage,
  getPurchasesByIngredient,
  getSalesTotal,
  getLatestFinalizedCountBefore,
  getDailySummary,
  getDailyCancelled,
  getRevenueByCategory,
  getTopItems,
  getHourlySales,
  getTrends,
  getItemProfitability,
  getStaffPerformance,
  getItemsByPeriod,
  getStaffByPeriod,
  getSalesSummary,
  getRevenueByChannel,
  getCollectionByMethod,
  getCollectionByCounter,
  getRevenueByItemGroup,
  getTopSellingItems,
  getTableWiseSales,
  getNCSales,
};
