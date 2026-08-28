const db = require('../shared/db');

/*
 * Accounting bridge data access — the billed-income and collected-by-tender
 * figures per day, from completed payments. Same source and same filters as the
 * Reports sales summary, so the export can never disagree with the screen.
 */

/** Per-day billed income parts and the POS's own discount total. */
const getDailyIncome = (from, to, tz, restaurantId) =>
  db.query(
    `SELECT to_char((o.created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS date,
            COUNT(DISTINCT o.id)::int                     AS orders,
            COALESCE(SUM(p.subtotal), 0)::float8              AS subtotal,
            COALESCE(SUM(p.tax_amount), 0)::float8            AS tax_amount,
            COALESCE(SUM(p.service_charge_amount), 0)::float8 AS service_charge,
            COALESCE(SUM(p.packaging_fee), 0)::float8         AS packaging_fee,
            COALESCE(SUM(p.discount_amount
                       + p.coupon_discount_amount
                       + p.loyalty_discount_amount), 0)::float8 AS recorded_discount,
            COALESCE(SUM(p.total_charged), 0)::float8         AS total_charged
       FROM orders o
       JOIN payments p ON p.order_id = o.id
      WHERE (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
        AND p.status = 'completed'
        AND o.restaurant_id = $4
      GROUP BY (o.created_at AT TIME ZONE $3)::date
      ORDER BY 1`,
    [from, to, tz, restaurantId],
  ).then((r) => r.rows);

/** Per-day collections split by tender. */
const getDailyCollections = (from, to, tz, restaurantId) =>
  db.query(
    `SELECT to_char((o.created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS date,
            p.method                             AS method,
            COALESCE(SUM(p.total_charged), 0)::float8 AS amount
       FROM orders o
       JOIN payments p ON p.order_id = o.id
      WHERE (o.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2
        AND p.status = 'completed'
        AND o.restaurant_id = $4
      GROUP BY (o.created_at AT TIME ZONE $3)::date, p.method
      ORDER BY 1`,
    [from, to, tz, restaurantId],
  ).then((r) => r.rows);

const getRestaurantName = (restaurantId) =>
  db.query('SELECT name FROM restaurants WHERE id = $1', [restaurantId])
    .then((r) => r.rows[0]?.name || 'CookLyt');

module.exports = { getDailyIncome, getDailyCollections, getRestaurantName };
