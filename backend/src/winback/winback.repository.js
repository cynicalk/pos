const db = require('../shared/db');

/*
 * Winback offer data access. The offer's discount and lifecycle live on the
 * linked coupon (coupons/coupon_redemptions); this table only records which
 * lapsed guest each offer was issued to.
 */

/** One guest's paid-order history, to re-derive their churn status server-side. */
const getGuestForOffer = (restaurantId, customerId, windowDays) =>
  db.query(
    `SELECT lc.id AS customer_id, lc.phone, lc.name,
            array_agg(o.created_at ORDER BY o.created_at) AS order_dates,
            COALESCE(SUM(
              (SELECT COALESCE(SUM(p.amount), 0)
                 FROM payments p WHERE p.order_id = o.id AND p.status = 'completed')
            ), 0)::numeric AS total_spend
       FROM loyalty_customers lc
       JOIN orders o
         ON o.loyalty_customer_id = lc.id
        AND o.restaurant_id       = lc.restaurant_id
        AND o.status              = 'paid'
        AND o.created_at >= now() - ($3::int * INTERVAL '1 day')
      WHERE lc.restaurant_id = $1 AND lc.id = $2
      GROUP BY lc.id, lc.phone, lc.name`,
    [restaurantId, customerId, windowDays],
  ).then((r) => r.rows[0] || null);

/** An existing open offer for this guest, if any — to avoid issuing a duplicate. */
const getOpenOfferForGuest = (restaurantId, customerId) =>
  db.query(
    `SELECT w.id, c.code
       FROM winback_offers w
       JOIN coupons c ON c.id = w.coupon_id
      WHERE w.restaurant_id = $1
        AND w.loyalty_customer_id = $2
        AND c.uses_count = 0
        AND c.is_active = true
        AND (c.expires_at IS NULL OR c.expires_at > now())
      LIMIT 1`,
    [restaurantId, customerId],
  ).then((r) => r.rows[0] || null);

const insertOffer = (restaurantId, { customerId, couponId, churnStatus, userId }) =>
  db.query(
    `INSERT INTO winback_offers (restaurant_id, loyalty_customer_id, coupon_id, churn_status, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [restaurantId, customerId, couponId, churnStatus, userId || null],
  ).then((r) => r.rows[0]);

/**
 * Every offer with its coupon terms, the guest, and — for redeemed ones — when
 * it was used. One query so the list is a single round trip.
 */
const listOffers = (restaurantId) =>
  db.query(
    `SELECT w.id, w.churn_status, w.created_at,
            lc.id AS customer_id, lc.name, lc.phone,
            c.code, c.discount_type, c.discount_value, c.min_order_amount,
            c.uses_count, c.is_active, c.expires_at,
            (SELECT MAX(cr.created_at) FROM coupon_redemptions cr WHERE cr.coupon_id = c.id) AS redeemed_at
       FROM winback_offers w
       JOIN loyalty_customers lc ON lc.id = w.loyalty_customer_id
       JOIN coupons c            ON c.id = w.coupon_id
      WHERE w.restaurant_id = $1
      ORDER BY w.created_at DESC`,
    [restaurantId],
  ).then((r) => r.rows);

/** Codes already taken, to guarantee a fresh one on generation. */
const codeExists = (restaurantId, code) =>
  db.query(
    'SELECT 1 FROM coupons WHERE restaurant_id = $1 AND code = $2 LIMIT 1',
    [restaurantId, code],
  ).then((r) => r.rows.length > 0);

module.exports = { getGuestForOffer, getOpenOfferForGuest, insertOffer, listOffers, codeExists };
