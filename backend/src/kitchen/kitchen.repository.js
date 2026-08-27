const db = require('../shared/db');

const getPendingItems = (restaurantId) =>
  db
    .query(
      `
    SELECT
      oi.id             AS order_item_id,
      oi.order_id,
      oi.quantity,
      oi.notes,
      oi.customizations,
      oi.status         AS item_status,
      COALESCE(oi.item_name, mi.name)  AS item_name,
      COALESCE(oi.unit_price, mi.price) AS item_price,
      mi.category,
      o.table_id,
      o.table_session_id,
      o.channel,
      o.customer_ref,
      o.loyalty_customer_id,
      o.status       AS order_status,
      t.number       AS table_number,
      o.created_at   AS order_created_at,
      su.email       AS assigned_staff_email,
      su.name        AS assigned_staff_name,
      lc.name        AS loyalty_customer_name,
      lc.phone       AS loyalty_customer_phone,
      (SELECT lt.name FROM loyalty_tiers lt
         WHERE lt.restaurant_id = lc.restaurant_id
           AND lc.points_balance >= lt.min_points
         ORDER BY lt.min_points DESC LIMIT 1) AS loyalty_customer_tier
    FROM order_items oi
    JOIN orders o        ON o.id = oi.order_id
    JOIN menu_items mi   ON mi.id = oi.menu_item_id
    LEFT JOIN tables t   ON t.id = o.table_id
    LEFT JOIN users su   ON su.id = o.assigned_staff_id
    LEFT JOIN loyalty_customers lc ON lc.id = o.loyalty_customer_id
    WHERE o.status IN ('received', 'preparing', 'ready', 'served')
      AND o.restaurant_id = $1
      AND oi.status != 'cancelled'
    ORDER BY o.created_at ASC
  `,
      [restaurantId],
    )
    .then((r) => r.rows);

module.exports = { getPendingItems };
