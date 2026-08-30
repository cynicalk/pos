const db = require('../shared/db');

// Insights is READ-ONLY — it never writes to any table.
//
// Two conventions are shared with reports.repository.js on purpose, so the
// numbers on these pages can never disagree with the numbers on Reports:
//   revenue      = payments where status = 'completed'
//   a dish's cost = SUM(recipe_ingredients.quantity * cost_per_unit)
// A second definition of either would be a drift bug that only surfaces when an
// operator notices two screens contradicting each other.

/** Per-dish volume, revenue and unit cost over a window. */
const getMenuPerformance = (restaurantId, days) =>
  db.query(`
    SELECT
      mi.id,
      mi.name,
      mi.category,
      mi.price                                AS selling_price,
      COALESCE(SUM(oi.quantity), 0)::int      AS total_sold,
      COALESCE(SUM(mi.price * oi.quantity), 0) AS revenue,
      (
        SELECT COALESCE(SUM(ri.quantity * ri.cost_per_unit), 0)
        FROM recipe_ingredients ri
        WHERE ri.recipe_id = mi.recipe_id
      )                                       AS cost_per_unit
    FROM menu_items mi
    LEFT JOIN order_items oi ON oi.menu_item_id = mi.id
    LEFT JOIN orders o      ON o.id = oi.order_id
                           AND o.restaurant_id = $1
                           AND o.created_at >= now() - make_interval(days => $2)
    LEFT JOIN payments p    ON p.order_id = o.id AND p.status = 'completed'
    WHERE mi.restaurant_id = $1
      AND mi.archived_at IS NULL
      -- A LEFT JOIN that failed the payment filter must contribute nothing, or
      -- an unsold dish would count the row as a sale of quantity NULL.
      AND (oi.id IS NULL OR p.id IS NOT NULL)
    GROUP BY mi.id, mi.name, mi.category, mi.price, mi.recipe_id
    ORDER BY revenue DESC
  `, [restaurantId, days]).then((r) => r.rows);

/** Distinct trading days with sales in the window, for per-day averages. */
const getSpanDays = (restaurantId, tz, days) =>
  db.query(`
    SELECT COUNT(DISTINCT (o.created_at AT TIME ZONE $2)::date)::int AS span
    FROM orders o
    JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
    WHERE o.restaurant_id = $1
      AND o.created_at >= now() - make_interval(days => $3)
  `, [restaurantId, tz, days]).then((r) => Number(r.rows[0]?.span || 0));

/** Basket lines for the association-rule pass. */
const getBasketLines = (restaurantId, days) =>
  db.query(`
    SELECT oi.order_id, COALESCE(oi.item_name, mi.name) AS item_name
    FROM order_items oi
    JOIN orders o        ON o.id = oi.order_id
    JOIN payments p      ON p.order_id = o.id AND p.status = 'completed'
    LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE o.restaurant_id = $1
      AND o.created_at >= now() - make_interval(days => $2)
      AND oi.status IS DISTINCT FROM 'cancelled'
      AND COALESCE(oi.item_name, mi.name) IS NOT NULL
  `, [restaurantId, days]).then((r) => r.rows);

/**
 * Dishes added recently, with sales counted only from their own launch date.
 * Rows without created_at are excluded here rather than downstream — a dish
 * with no launch date has no launch curve.
 */
const getNewItems = (restaurantId, windowDays) =>
  db.query(`
    SELECT
      mi.id, mi.name, mi.category, mi.created_at,
      COALESCE(SUM(oi.quantity), 0)::int        AS sold,
      COALESCE(SUM(mi.price * oi.quantity), 0)  AS revenue
    FROM menu_items mi
    LEFT JOIN order_items oi ON oi.menu_item_id = mi.id
    LEFT JOIN orders o      ON o.id = oi.order_id
                           AND o.restaurant_id = $1
                           AND o.created_at >= mi.created_at
    LEFT JOIN payments p    ON p.order_id = o.id AND p.status = 'completed'
    WHERE mi.restaurant_id = $1
      AND mi.archived_at IS NULL
      AND mi.created_at IS NOT NULL
      AND mi.created_at >= now() - make_interval(days => $2)
      AND (oi.id IS NULL OR p.id IS NOT NULL)
    GROUP BY mi.id, mi.name, mi.category, mi.created_at
    ORDER BY mi.created_at DESC
  `, [restaurantId, windowDays]).then((r) => r.rows);

/** Orders and revenue by hour of the restaurant's own local clock. */
const getHourBuckets = (restaurantId, tz, days, channel = null) =>
  db.query(`
    SELECT
      EXTRACT(HOUR FROM o.created_at AT TIME ZONE $2)::int AS hour,
      COUNT(DISTINCT o.id)::int                            AS orders,
      COALESCE(SUM(p.amount), 0)                           AS revenue
    FROM orders o
    JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
    WHERE o.restaurant_id = $1
      AND o.created_at >= now() - make_interval(days => $3)
      AND ($4::text IS NULL OR o.channel = $4)
    GROUP BY 1
    ORDER BY 1
  `, [restaurantId, tz, days, channel]).then((r) => r.rows);

/** Payment-side totals over the window — same basis as the sales summary. */
const getEconomicsTotals = (restaurantId, days) =>
  db.query(`
    SELECT
      COUNT(DISTINCT o.id)::int                   AS orders,
      COALESCE(SUM(p.amount), 0)                  AS revenue,
      COALESCE(SUM(p.subtotal), 0)                AS subtotal,
      COALESCE(SUM(p.discount_amount), 0)         AS discount,
      COALESCE(SUM(p.coupon_discount_amount), 0)  AS coupon,
      COALESCE(SUM(p.loyalty_discount_amount), 0) AS loyalty,
      COALESCE(SUM(p.tax_amount), 0)              AS tax,
      COALESCE(SUM(p.service_charge_amount), 0)   AS service_charge
    FROM orders o
    JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
    WHERE o.restaurant_id = $1
      AND o.created_at >= now() - make_interval(days => $2)
  `, [restaurantId, days]).then((r) => r.rows[0]);

/**
 * Per-coupon economics over the window: how many orders each code drove, what was
 * collected on them, what was given away, and how much of that collection came on
 * a commissioned (delivery) channel. Same completed-payment revenue basis as
 * everything else here.
 */
const getCouponEconomics = (restaurantId, days) =>
  db.query(`
    SELECT
      c.id,
      c.code,
      c.discount_type                                   AS "discountType",
      c.discount_value                                  AS "discountValue",
      COUNT(*)::int                                     AS orders,
      COALESCE(SUM(p.amount), 0)::float8                AS collected,
      COALESCE(SUM(cr.discount_amount), 0)::float8      AS discount,
      COALESCE(SUM(CASE WHEN o.channel = 'delivery' THEN p.amount ELSE 0 END), 0)::float8
                                                        AS "deliveryCollected"
    FROM coupon_redemptions cr
    JOIN orders o    ON o.id = cr.order_id AND o.restaurant_id = $1
    JOIN payments p  ON p.order_id = o.id AND p.status = 'completed'
    JOIN coupons c   ON c.id = cr.coupon_id
    WHERE cr.restaurant_id = $1
      AND o.created_at >= now() - make_interval(days => $2)
    GROUP BY c.id, c.code, c.discount_type, c.discount_value
  `, [restaurantId, days]).then((r) => r.rows);

/** Average contracted delivery commission (a fraction), applied to delivery redemptions. */
const getAvgCommissionRate = (restaurantId) =>
  db.query(
    `SELECT COALESCE(AVG(commission_rate), 0)::float8 AS rate
       FROM platform_contracts WHERE restaurant_id = $1`,
    [restaurantId],
  ).then((r) => Number(r.rows[0]?.rate || 0));

/**
 * Category items sold and baskets carrying each category, split into the current
 * window and the prior window of equal length, for the attach-rate delta.
 */
const getCategoryAttach = (restaurantId, days) =>
  db.query(`
    WITH paid AS (
      SELECT o.id,
        CASE
          WHEN o.created_at >= now() - make_interval(days => $2) THEN 'cur'
          ELSE 'prev'
        END AS period
      FROM orders o
      JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
      WHERE o.restaurant_id = $1
        AND o.created_at >= now() - make_interval(days => $2 * 2)
    )
    SELECT
      paid.period,
      COALESCE(mi.category, 'Uncategorised')       AS category,
      COALESCE(SUM(oi.quantity), 0)::int           AS items,
      COUNT(DISTINCT paid.id)::int                 AS "ordersWith"
    FROM paid
    JOIN order_items oi ON oi.order_id = paid.id AND oi.status IS DISTINCT FROM 'cancelled'
    JOIN menu_items mi  ON mi.id = oi.menu_item_id
    GROUP BY paid.period, COALESCE(mi.category, 'Uncategorised')
  `, [restaurantId, days]).then((r) => r.rows);

/** Paid-order counts for the current and prior windows, the attach denominator. */
const getPeriodOrderTotals = (restaurantId, days) =>
  db.query(`
    SELECT
      CASE
        WHEN o.created_at >= now() - make_interval(days => $2) THEN 'cur'
        ELSE 'prev'
      END AS period,
      COUNT(DISTINCT o.id)::int AS "totalOrders"
    FROM orders o
    JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
    WHERE o.restaurant_id = $1
      AND o.created_at >= now() - make_interval(days => $2 * 2)
    GROUP BY 1
  `, [restaurantId, days]).then((r) => r.rows);

/** Cancellations and the revenue that walked out with them. */
const getCancellationTotals = (restaurantId, days) =>
  db.query(`
    SELECT
      (SELECT COUNT(*) FROM orders
        WHERE restaurant_id = $1
          AND created_at >= now() - make_interval(days => $2))::int AS total_orders,
      (SELECT COUNT(*) FROM orders
        WHERE restaurant_id = $1 AND status = 'cancelled'
          AND created_at >= now() - make_interval(days => $2))::int AS cancelled_orders,
      (SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0)
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
        WHERE o.restaurant_id = $1 AND o.status = 'cancelled'
          AND o.created_at >= now() - make_interval(days => $2)) AS lost_revenue
  `, [restaurantId, days]).then((r) => r.rows[0]);

/**
 * Food cost of what was actually sold, counting ONLY lines whose dish has a
 * costed recipe. `items_total` says how many lines were in scope, so the UI can
 * state what share of the menu the percentage is based on instead of implying
 * it covers everything.
 */
const getFoodCostTotals = (restaurantId, days) =>
  db.query(`
    WITH lines AS (
      SELECT
        oi.quantity,
        mi.price AS unit_price,
        (
          SELECT COALESCE(SUM(ri.quantity * ri.cost_per_unit), 0)
          FROM recipe_ingredients ri
          WHERE ri.recipe_id = mi.recipe_id
        ) AS unit_cost
      FROM order_items oi
      JOIN orders o     ON o.id = oi.order_id
      JOIN payments p   ON p.order_id = o.id AND p.status = 'completed'
      JOIN menu_items mi ON mi.id = oi.menu_item_id
      WHERE o.restaurant_id = $1
        AND o.created_at >= now() - make_interval(days => $2)
        AND oi.status IS DISTINCT FROM 'cancelled'
    )
    SELECT
      COALESCE(SUM(quantity * unit_cost) FILTER (WHERE unit_cost > 0), 0)  AS food_cost,
      COALESCE(SUM(quantity * unit_price) FILTER (WHERE unit_cost > 0), 0) AS item_revenue,
      COUNT(*) FILTER (WHERE unit_cost > 0)::int                           AS items_costed,
      COUNT(*)::int                                                        AS items_total
    FROM lines
  `, [restaurantId, days]).then((r) => r.rows[0]);

/** All per-dish quantities over the span, for the menu-wide median rate. */
const getAllItemQuantities = (restaurantId, days) =>
  db.query(`
    SELECT COALESCE(SUM(oi.quantity), 0)::int AS qty
    FROM order_items oi
    JOIN orders o   ON o.id = oi.order_id
    JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
    WHERE o.restaurant_id = $1
      AND o.created_at >= now() - make_interval(days => $2)
      AND oi.status IS DISTINCT FROM 'cancelled'
    GROUP BY oi.menu_item_id
  `, [restaurantId, days]).then((r) => r.rows.map((x) => x.qty));

const getTimezone = (restaurantId) =>
  db.query(
    `SELECT value FROM settings WHERE restaurant_id = $1 AND key = 'timezone'`,
    [restaurantId],
  ).then((r) => r.rows[0]?.value || 'UTC');

/**
 * Delivery platform cost for the period, from reconciled settlement lines.
 *
 * The real cost of an aggregator order is what the platform kept: commission,
 * the taxes withheld on it (TDS/TCS), and any SLA penalty — i.e. gross minus the
 * net that actually landed. Only orders whose settlement CSV has been imported
 * appear here, so `reconciledOrders` is reported alongside the total delivery
 * orders in the period: a commission figure that silently covered half of
 * delivery would flatter the margin exactly where it hurts.
 */
const getDeliveryCostTotals = (restaurantId, days) =>
  db.query(
    `SELECT
       COALESCE(SUM(so.commission), 0)::float8                    AS commission,
       COALESCE(SUM(so.tds + so.tcs), 0)::float8                  AS taxes_withheld,
       COALESCE(SUM(so.sla_penalty), 0)::float8                   AS penalties,
       COALESCE(SUM(so.gross_amount - so.net_amount), 0)::float8  AS platform_take,
       COALESCE(SUM(so.gross_amount), 0)::float8                  AS gross,
       COUNT(*)::int                                              AS reconciled_orders
     FROM settlement_orders so
     WHERE so.restaurant_id = $1
       AND so.order_date >= (now())::date - $2::int`,
    [restaurantId, days],
  ).then((r) => r.rows[0]);

/** How many delivery orders the period actually had, for reconciliation coverage. */
const getDeliveryOrderCount = (restaurantId, days) =>
  db.query(
    `SELECT COUNT(*)::int AS n
       FROM orders
      WHERE restaurant_id = $1 AND channel = 'delivery'
        AND created_at >= now() - make_interval(days => $2)`,
    [restaurantId, days],
  ).then((r) => r.rows[0].n);

module.exports = {
  getMenuPerformance, getSpanDays, getBasketLines, getNewItems, getHourBuckets,
  getEconomicsTotals, getCancellationTotals, getFoodCostTotals,
  getDeliveryCostTotals, getDeliveryOrderCount,
  getAllItemQuantities, getTimezone,
  getCouponEconomics, getAvgCommissionRate, getCategoryAttach, getPeriodOrderTotals,
};
