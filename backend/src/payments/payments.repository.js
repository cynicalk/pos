const db = require('../shared/db');

const getByOrderId = (orderId) =>
  db.query('SELECT * FROM payments WHERE order_id = $1', [orderId]).then((r) => r.rows);

// `runner` defaults to the pool but accepts a transaction client so the payment
// insert can be made atomic with the order-status flip (see payments.service).
const create = ({
  orderId, amount, method,
  subtotal, taxRate, taxAmount,
  serviceChargeRate, serviceChargeAmount,
  discountAmount, couponDiscountAmount = 0, loyaltyDiscountAmount = 0,
  packagingFee = 0, totalCharged, tenders = null,
}, runner = db) =>
  runner.query(
    `INSERT INTO payments
       (order_id, amount, method, status,
        subtotal, tax_rate, tax_amount,
        service_charge_rate, service_charge_amount,
        discount_amount, coupon_discount_amount, loyalty_discount_amount,
        packaging_fee, total_charged, tenders)
     VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      orderId, amount, method,
      subtotal, taxRate, taxAmount,
      serviceChargeRate, serviceChargeAmount,
      discountAmount ?? 0, couponDiscountAmount ?? 0, loyaltyDiscountAmount ?? 0,
      packagingFee ?? 0, totalCharged ?? amount,
      tenders ? JSON.stringify(tenders) : null,
    ],
  ).then((r) => r.rows[0]);

const updateStatus = (id, status, runner = db) =>
  runner.query('UPDATE payments SET status = $1 WHERE id = $2 RETURNING *', [status, id])
    .then((r) => r.rows[0]);

const getReceiptData = (orderId, restaurantId) =>
  db.query(
    `WITH payment_agg AS (
       SELECT
         order_id,
         SUM(total_charged)            AS total_charged,
         SUM(subtotal)                 AS subtotal,
         MAX(tax_rate)                 AS tax_rate,
         MAX(service_charge_rate)      AS service_charge_rate,
         SUM(tax_amount)               AS tax_amount,
         SUM(service_charge_amount)    AS service_charge_amount,
         SUM(discount_amount)          AS discount_amount,
         SUM(coupon_discount_amount)   AS coupon_discount_amount,
         SUM(loyalty_discount_amount)  AS loyalty_discount_amount,
         SUM(packaging_fee)            AS packaging_fee,
         CASE WHEN COUNT(*) = 1 THEN MAX(method) ELSE 'split' END AS method,
         jsonb_agg(
           jsonb_build_object(
             'method',  method,
             'amount',  total_charged,
             'tenders', tenders
           ) ORDER BY created_at
         ) AS payments_detail
       FROM payments
       WHERE status = 'completed'
       GROUP BY order_id
     )
     SELECT
       r.name              AS restaurant_name,
       o.id                AS order_id,
       o.order_ref,
       o.channel,
       o.customer_ref,
       o.created_at,
       o.discount_type,
       o.discount_value,
       t.number            AS table_number,
       pa.method           AS payment_method,
       pa.payments_detail,
       pa.total_charged,
       pa.subtotal,
       pa.tax_rate,
       pa.tax_amount,
       pa.service_charge_rate,
       pa.service_charge_amount,
       pa.discount_amount,
       pa.coupon_discount_amount,
       pa.loyalty_discount_amount,
       pa.packaging_fee,
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'name',     COALESCE(oi.item_name, mi.name),
             'quantity', oi.quantity,
             'price',    COALESCE(oi.unit_price, mi.price),
             'notes',    oi.notes
           ) ORDER BY mi.name
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::jsonb
       ) AS items
     FROM orders o
     JOIN restaurants    r  ON r.id  = o.restaurant_id
     LEFT JOIN tables    t  ON t.id  = o.table_id
     JOIN payment_agg    pa ON pa.order_id = o.id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN menu_items  mi ON mi.id = oi.menu_item_id
     WHERE o.id = $1 AND o.restaurant_id = $2
     GROUP BY r.name, o.id, o.order_ref, o.channel, o.customer_ref, o.created_at,
              o.discount_type, o.discount_value, t.number,
              pa.method, pa.payments_detail, pa.total_charged, pa.subtotal,
              pa.tax_rate, pa.tax_amount,
              pa.service_charge_rate, pa.service_charge_amount,
              pa.discount_amount, pa.coupon_discount_amount,
              pa.loyalty_discount_amount, pa.packaging_fee`,
    [orderId, restaurantId],
  ).then((r) => r.rows[0] || null);

module.exports = { getByOrderId, create, updateStatus, getReceiptData };
