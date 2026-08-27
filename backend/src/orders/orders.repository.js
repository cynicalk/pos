const db = require('../shared/db');

const getById = (id, restaurantId) =>
  db
    .query('SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2', [id, restaurantId])
    .then((r) => r.rows[0]);

const getActiveByTable = (tableId, restaurantId) =>
  db
    .query(
      `SELECT o.*,
              su.email AS assigned_staff_email,
              su.name  AS assigned_staff_name,
              json_agg(json_build_object(
                'id', oi.id,
                'menu_item_id', oi.menu_item_id,
                'quantity', oi.quantity,
                'notes', oi.notes,
                'name', COALESCE(oi.item_name, mi.name),
                'price', COALESCE(oi.unit_price, mi.price)
              )) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN menu_items mi  ON mi.id = oi.menu_item_id
       LEFT JOIN users su        ON su.id = o.assigned_staff_id
       WHERE o.table_id = $1 AND o.restaurant_id = $2
         AND o.status NOT IN ('paid', 'cancelled')
       GROUP BY o.id, su.email, su.name`,
      [tableId, restaurantId],
    )
    .then((r) => r.rows);

const getItemsByOrderId = (orderId, restaurantId) =>
  db
    .query(
      `SELECT oi.*,
              COALESCE(oi.item_name, mi.name)   AS name,
              COALESCE(oi.unit_price, mi.price)  AS price
       FROM order_items oi
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       JOIN orders     o  ON o.id  = oi.order_id
       WHERE oi.order_id = $1 AND o.restaurant_id = $2 AND oi.status != 'cancelled'`,
      [orderId, restaurantId],
    )
    .then((r) => r.rows);

// Assembles exactly the shape the dashboard's KOT ticket builder expects:
// order ref + location fields + non-cancelled items with category/customizations.
// Used by the kitchen-terminal auto-print on customer-placed orders.
const getKotData = (orderId, restaurantId) =>
  db
    .query(
      `SELECT o.id, o.order_ref, o.channel, o.customer_ref, o.created_at,
              t.number AS table_number,
              COALESCE(
                json_agg(
                  json_build_object(
                    'item_name',      COALESCE(oi.item_name, mi.name),
                    'category',       mi.category,
                    'quantity',       oi.quantity,
                    'notes',          oi.notes,
                    'customizations', oi.customizations,
                    'item_status',    oi.status
                  ) ORDER BY mi.category, mi.name
                ) FILTER (WHERE oi.id IS NOT NULL AND oi.status <> 'cancelled'),
                '[]'::json
              ) AS items
       FROM orders o
       LEFT JOIN tables      t  ON t.id  = o.table_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN menu_items  mi ON mi.id = oi.menu_item_id
       WHERE o.id = $1 AND o.restaurant_id = $2
       GROUP BY o.id, t.number`,
      [orderId, restaurantId],
    )
    .then((r) => r.rows[0] || null);

// Accepts an optional transaction `client`; when supplied the order + line items
// are written on the caller's transaction (so order creation and stock deduction
// commit or roll back together). Without one it opens its own transaction.
const create = (payload, client) =>
  client ? _create(client, payload) : db.withTransaction((c) => _create(c, payload));

const _create = async (client, { restaurantId, tableId, createdBy, items, channel = 'dining', customerRef = null, assignedStaffId = null }) => {
    // Reuse the session ID if this table already has active orders; otherwise start a new session.
    let sessionId = null;
    if (tableId) {
      const { rows } = await client.query(
        `SELECT table_session_id FROM orders
         WHERE table_id = $1 AND restaurant_id = $2 AND status NOT IN ('paid', 'cancelled')
         LIMIT 1`,
        [tableId, restaurantId],
      );
      sessionId = rows[0]?.table_session_id ?? null;
    }

    // Atomically increment the monthly counter and derive a human-readable ref.
    // Format: YYMM + letter (A–Z per 1000) + 3-digit sequence.
    // e.g. seq=29 in Feb 2025 → '2502A029'; seq=1000 → '2502B000'.
    const { rows: [counter] } = await client.query(
      `INSERT INTO order_counters (restaurant_id, year_month, seq)
       VALUES ($1, to_char(NOW() AT TIME ZONE 'UTC', 'YYMM'), 1)
       ON CONFLICT (restaurant_id, year_month)
       DO UPDATE SET seq = order_counters.seq + 1
       RETURNING seq, year_month`,
      [restaurantId],
    );
    const orderRef = `${counter.year_month}${String.fromCharCode(65 + Math.floor(counter.seq / 1000))}${String(counter.seq % 1000).padStart(3, '0')}`;

    const {
      rows: [order],
    } = await client.query(
      `INSERT INTO orders (restaurant_id, table_id, created_by, status, channel, customer_ref, assigned_staff_id, table_session_id, order_ref)
       VALUES ($1, $2, $3, 'received', $4, $5, $6, COALESCE($7, gen_random_uuid()), $8) RETURNING *`,
      [restaurantId, tableId || null, createdBy, channel, customerRef, assignedStaffId, sessionId, orderRef],
    );

    for (const item of items) {
      // Snapshot the item's name + unit price at order time so the line is immune to
      // later menu edits (O2). Pulled from menu_items in the same statement.
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, notes, customizations, item_name, unit_price)
         SELECT $1, $2, $3, $4, $5, mi.name, mi.price FROM menu_items mi WHERE mi.id = $2`,
        [order.id, item.menuItemId, item.quantity, item.notes || null, JSON.stringify(item.customizations || {})],
      );
    }

    return order;
};

const addItems = (orderId, items, restaurantId, client) =>
  client ? _addItems(client, orderId, items, restaurantId)
         : db.withTransaction((c) => _addItems(c, orderId, items, restaurantId));

const _addItems = async (client, orderId, items, restaurantId) => {
    // Defence in depth: confirm the order belongs to this restaurant (and lock it)
    // before inserting, so a stray orderId can never graft items onto another
    // tenant's order even if a caller skipped the service-layer ownership check.
    const { rowCount } = await client.query(
      'SELECT 1 FROM orders WHERE id = $1 AND restaurant_id = $2 FOR UPDATE',
      [orderId, restaurantId],
    );
    if (rowCount === 0) return;
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, notes, customizations, item_name, unit_price)
         SELECT $1, $2, $3, $4, $5, mi.name, mi.price FROM menu_items mi WHERE mi.id = $2`,
        [orderId, item.menuItemId, item.quantity, item.notes || null, JSON.stringify(item.customizations || {})],
      );
    }
};

const updateStatus = (id, status, restaurantId) =>
  db
    .query('UPDATE orders SET status = $1 WHERE id = $2 AND restaurant_id = $3 RETURNING *', [status, id, restaurantId])
    .then((r) => r.rows[0]);

const assignStaff = (orderId, staffId, restaurantId) =>
  db
    .query(
      `UPDATE orders SET assigned_staff_id = $1
       WHERE id = $2 AND restaurant_id = $3
       RETURNING id, assigned_staff_id`,
      [staffId, orderId, restaurantId],
    )
    .then((r) => r.rows[0]);

const updateItemStatus = (itemId, orderId, status, cancelReason, restaurantId) =>
  db
    .query(
      `UPDATE order_items
       SET status        = $1,
           cancel_reason = CASE WHEN $4::varchar IS NOT NULL THEN $4 ELSE cancel_reason END
       WHERE id = $2 AND order_id = $3
         AND EXISTS (SELECT 1 FROM orders o WHERE o.id = $3 AND o.restaurant_id = $5)
       RETURNING *`,
      [status, itemId, orderId, cancelReason ?? null, restaurantId],
    )
    .then((r) => r.rows[0]);

const getItemStatuses = (orderId, restaurantId) =>
  db
    .query(
      `SELECT oi.id, oi.status, oi.menu_item_id, oi.quantity, mi.name AS menu_item_name
       FROM order_items oi
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       JOIN orders     o  ON o.id  = oi.order_id
       WHERE oi.order_id = $1 AND o.restaurant_id = $2`,
      [orderId, restaurantId],
    )
    .then((r) => r.rows);

const setDiscount = (id, discountType, discountValue, restaurantId) =>
  db
    .query(
      'UPDATE orders SET discount_type = $1, discount_value = $2 WHERE id = $3 AND restaurant_id = $4 RETURNING *',
      [discountType, discountValue, id, restaurantId],
    )
    .then((r) => r.rows[0]);

const calculateTotal = (orderId, restaurantId) =>
  db
    .query(
      `SELECT COALESCE(SUM(COALESCE(oi.unit_price, mi.price) * oi.quantity), 0) AS total
       FROM order_items oi
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       JOIN orders     o  ON o.id  = oi.order_id
       WHERE oi.order_id = $1 AND o.restaurant_id = $2 AND oi.status != 'cancelled'`,
      [orderId, restaurantId],
    )
    .then((r) => parseFloat(r.rows[0].total));

const getHistory = (restaurantId, { from, to, status, channel, timezone }) =>
  db.query(
    `SELECT
       o.id,
       o.order_ref,
       o.status,
       o.channel,
       o.customer_ref,
       o.created_at,
       o.discount_type,
       o.discount_value,
       o.table_session_id,
       o.loyalty_customer_id,
       t.number        AS table_number,
       u.email         AS created_by_email,
       su.email        AS assigned_staff_email,
       su.name         AS assigned_staff_name,
       lc.name         AS customer_name,
       lc.phone        AS customer_phone,
       (SELECT lt.name FROM loyalty_tiers lt
          WHERE lt.restaurant_id = lc.restaurant_id
            AND lc.points_balance >= lt.min_points
          ORDER BY lt.min_points DESC LIMIT 1) AS customer_tier,
       p.method        AS payment_method,
       p.total_charged,
       p.subtotal      AS bill_subtotal,
       p.tax_rate,
       p.tax_amount,
       p.service_charge_rate,
       p.service_charge_amount,
       p.discount_amount AS bill_discount_amount,
       COALESCE(SUM(COALESCE(oi.unit_price, mi.price) * oi.quantity), 0) AS items_total,
       COALESCE(
         json_agg(
           json_build_object(
             'name',     COALESCE(oi.item_name, mi.name),
             'quantity', oi.quantity,
             'price',    COALESCE(oi.unit_price, mi.price),
             'notes',    oi.notes
           ) ORDER BY mi.name
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::json
       ) AS items
     FROM orders o
     LEFT JOIN users             u  ON u.id  = o.created_by
     LEFT JOIN users             su ON su.id = o.assigned_staff_id
     LEFT JOIN loyalty_customers lc ON lc.id = o.loyalty_customer_id
     LEFT JOIN tables      t  ON t.id  = o.table_id
     LEFT JOIN (
       SELECT
         order_id,
         CASE WHEN COUNT(*) = 1 THEN MAX(method) ELSE 'split' END AS method,
         SUM(total_charged)         AS total_charged,
         SUM(subtotal)              AS subtotal,
         MAX(tax_rate)              AS tax_rate,
         SUM(tax_amount)            AS tax_amount,
         MAX(service_charge_rate)   AS service_charge_rate,
         SUM(service_charge_amount) AS service_charge_amount,
         SUM(discount_amount)       AS discount_amount
       FROM payments
       WHERE status = 'completed'
       GROUP BY order_id
     ) p ON p.order_id = o.id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN menu_items  mi ON mi.id = oi.menu_item_id
     WHERE o.restaurant_id = $1
       AND (o.created_at AT TIME ZONE $2)::date >= $3::date
       AND (o.created_at AT TIME ZONE $2)::date <= $4::date
       AND ($5::text IS NULL OR o.status  = $5)
       AND ($6::text IS NULL OR o.channel = $6)
     GROUP BY o.id, o.order_ref, o.table_session_id, t.number, u.email, su.email, su.name, lc.id, lc.name, lc.phone,
              p.method, p.total_charged, p.subtotal,
              p.tax_rate, p.tax_amount,
              p.service_charge_rate, p.service_charge_amount,
              p.discount_amount
     ORDER BY o.created_at DESC`,
    [restaurantId, timezone, from, to, status || null, channel || null],
  ).then((r) => r.rows);

const setCoupon = (id, couponId, couponDiscountAmount, restaurantId) =>
  db.query(
    'UPDATE orders SET coupon_id = $1, coupon_discount_amount = $2 WHERE id = $3 AND restaurant_id = $4 RETURNING *',
    [couponId, couponDiscountAmount, id, restaurantId],
  ).then((r) => r.rows[0]);

const clearCoupon = (id, restaurantId) =>
  db.query(
    'UPDATE orders SET coupon_id = NULL, coupon_discount_amount = 0 WHERE id = $1 AND restaurant_id = $2 RETURNING *',
    [id, restaurantId],
  ).then((r) => r.rows[0]);

const setLoyalty = (id, customerId, pointsRedeemed, discountAmount, restaurantId) =>
  db.query(
    `UPDATE orders SET loyalty_customer_id = $1, loyalty_points_redeemed = $2, loyalty_discount_amount = $3
     WHERE id = $4 AND restaurant_id = $5 RETURNING *`,
    [customerId, pointsRedeemed, discountAmount, id, restaurantId],
  ).then((r) => r.rows[0]);

const clearLoyalty = (id, restaurantId) =>
  db.query(
    `UPDATE orders SET loyalty_customer_id = NULL, loyalty_points_redeemed = 0, loyalty_discount_amount = 0
     WHERE id = $1 AND restaurant_id = $2 RETURNING *`,
    [id, restaurantId],
  ).then((r) => r.rows[0]);

module.exports = {
  getById,
  getActiveByTable,
  getItemsByOrderId,
  getKotData,
  create,
  addItems,
  updateStatus,
  assignStaff,
  updateItemStatus,
  getItemStatuses,
  setDiscount,
  calculateTotal,
  getHistory,
  setCoupon, clearCoupon,
  setLoyalty, clearLoyalty,
};
