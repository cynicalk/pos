const db = require('../shared/db');
const { buildUpdateSet } = require('../shared/sql');

const list = (restaurantId, { includeInactive = false } = {}) =>
  db.query(
    `SELECT * FROM coupons WHERE restaurant_id = $1 ${includeInactive ? '' : 'AND is_active = true'}
     ORDER BY created_at DESC`,
    [restaurantId],
  ).then((r) => r.rows);

const getById = (restaurantId, id) =>
  db.query(
    'SELECT * FROM coupons WHERE restaurant_id = $1 AND id = $2',
    [restaurantId, id],
  ).then((r) => r.rows[0] || null);

const getByCode = (restaurantId, code) =>
  db.query(
    'SELECT * FROM coupons WHERE restaurant_id = $1 AND code = $2',
    [restaurantId, code.toUpperCase()],
  ).then((r) => r.rows[0] || null);

const create = (restaurantId, { code, description, discountType, discountValue, minOrderAmount, maxUses, expiresAt }) =>
  db.query(
    `INSERT INTO coupons
       (restaurant_id, code, description, discount_type, discount_value, min_order_amount, max_uses, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      restaurantId,
      code.toUpperCase(),
      description || null,
      discountType,
      discountValue,
      minOrderAmount || 0,
      maxUses || null,
      expiresAt || null,
    ],
  ).then((r) => r.rows[0]);

const update = (restaurantId, id, fields) => {
  const { clause, values } = buildUpdateSet({
    code:             fields.code !== undefined ? fields.code.toUpperCase() : undefined,
    description:      fields.description,
    discount_type:    fields.discountType,
    discount_value:   fields.discountValue,
    min_order_amount: fields.minOrderAmount,
    max_uses:         fields.maxUses,
    expires_at:       fields.expiresAt,
    is_active:        fields.isActive,
  }, 3);
  if (!clause) return getById(restaurantId, id);
  return db.query(
    `UPDATE coupons SET ${clause} WHERE restaurant_id = $1 AND id = $2 RETURNING *`,
    [restaurantId, id, ...values],
  ).then((r) => r.rows[0]);
};

const remove = (id) =>
  db.query('DELETE FROM coupons WHERE id = $1', [id]);

const hasRedemptions = (id) =>
  db.query('SELECT 1 FROM coupon_redemptions WHERE coupon_id = $1 LIMIT 1', [id])
    .then((r) => r.rows.length > 0);

// Atomically record redemption + increment uses_count
const recordRedemption = (restaurantId, couponId, orderId, discountAmount) =>
  db.withTransaction(async (client) => {
    await client.query(
      `INSERT INTO coupon_redemptions (coupon_id, order_id, restaurant_id, discount_amount)
       VALUES ($1, $2, $3, $4)`,
      [couponId, orderId, restaurantId, discountAmount],
    );
    await client.query(
      'UPDATE coupons SET uses_count = uses_count + 1 WHERE id = $1',
      [couponId],
    );
  });

// Undo redemption if coupon is removed from an order before payment
const removeRedemption = (orderId) =>
  db.withTransaction(async (client) => {
    const res = await client.query(
      'DELETE FROM coupon_redemptions WHERE order_id = $1 RETURNING coupon_id',
      [orderId],
    );
    if (res.rows.length) {
      await client.query(
        'UPDATE coupons SET uses_count = GREATEST(uses_count - 1, 0) WHERE id = $1',
        [res.rows[0].coupon_id],
      );
    }
  });

module.exports = { list, getById, getByCode, create, update, remove, hasRedemptions, recordRedemption, removeRedemption };
