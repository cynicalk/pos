const repo = require('./coupons.repository');
const { NotFoundError, ValidationError } = require('../shared/errors');

function validate({ code, discountType, discountValue, minOrderAmount, maxUses }) {
  if (!code || !code.trim()) throw new ValidationError('code is required');
  if (!['percent', 'flat'].includes(discountType)) throw new ValidationError('discount_type must be percent or flat');
  const v = parseFloat(discountValue);
  if (isNaN(v) || v <= 0) throw new ValidationError('discount_value must be positive');
  if (discountType === 'percent' && v > 100) throw new ValidationError('Percent discount cannot exceed 100');
  if (minOrderAmount !== undefined && parseFloat(minOrderAmount) < 0) throw new ValidationError('min_order_amount cannot be negative');
  if (maxUses !== undefined && maxUses !== null) {
    const m = parseInt(maxUses);
    if (isNaN(m) || m < 1) throw new ValidationError('max_uses must be a positive integer');
  }
}

async function listCoupons(restaurantId, query = {}) {
  return repo.list(restaurantId, { includeInactive: query.includeInactive === 'true' });
}

async function getCoupon(restaurantId, id) {
  const c = await repo.getById(restaurantId, id);
  if (!c) throw new NotFoundError('Coupon');
  return c;
}

async function createCoupon(restaurantId, body) {
  const { code, description, discount_type: discountType, discount_value: discountValue,
          min_order_amount: minOrderAmount, max_uses: maxUses, expires_at: expiresAt } = body;
  validate({ code, discountType, discountValue, minOrderAmount, maxUses });
  return repo.create(restaurantId, { code, description, discountType, discountValue, minOrderAmount, maxUses, expiresAt });
}

async function updateCoupon(restaurantId, id, body) {
  await getCoupon(restaurantId, id);
  const fields = {};
  if (body.code              !== undefined) { validate({ code: body.code, discountType: 'percent', discountValue: 1 }); fields.code = body.code; }
  if (body.description       !== undefined) fields.description   = body.description;
  if (body.discount_type     !== undefined) fields.discountType  = body.discount_type;
  if (body.discount_value    !== undefined) fields.discountValue = body.discount_value;
  if (body.min_order_amount  !== undefined) fields.minOrderAmount = body.min_order_amount;
  if (body.max_uses          !== undefined) fields.maxUses       = body.max_uses;
  if (body.expires_at        !== undefined) fields.expiresAt     = body.expires_at;
  if (body.is_active         !== undefined) fields.isActive      = body.is_active;
  return repo.update(restaurantId, id, fields);
}

async function deleteCoupon(restaurantId, id) {
  await getCoupon(restaurantId, id);
  const used = await repo.hasRedemptions(id);
  if (used) throw new ValidationError('Cannot delete a coupon that has already been used');
  await repo.remove(id);
}

// Preview: validate coupon + compute discount without persisting
async function previewCoupon(restaurantId, code, orderSubtotal) {
  const coupon = await repo.getByCode(restaurantId, code);
  if (!coupon) throw new ValidationError('Invalid coupon code');
  if (!coupon.is_active) throw new ValidationError('This coupon is no longer active');
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) throw new ValidationError('This coupon has expired');
  if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) throw new ValidationError('This coupon has reached its usage limit');
  const sub = parseFloat(orderSubtotal || 0);
  if (sub < parseFloat(coupon.min_order_amount)) {
    throw new ValidationError(`Minimum order amount for this coupon is ${coupon.min_order_amount}`);
  }
  let discountAmount;
  if (coupon.discount_type === 'percent') {
    discountAmount = parseFloat((sub * (parseFloat(coupon.discount_value) / 100)).toFixed(2));
  } else {
    discountAmount = parseFloat(Math.min(parseFloat(coupon.discount_value), sub).toFixed(2));
  }
  return { coupon, discountAmount };
}

// Apply: validate + persist redemption + return { couponId, discountAmount }
// Removes any existing redemption first so swapping coupons on an order is safe.
async function validateAndApplyCoupon(restaurantId, code, orderSubtotal, orderId) {
  const { coupon, discountAmount } = await previewCoupon(restaurantId, code, orderSubtotal);
  await repo.removeRedemption(orderId);
  await repo.recordRedemption(restaurantId, coupon.id, orderId, discountAmount);
  return { couponId: coupon.id, discountAmount };
}

async function removeCouponFromOrder(orderId) {
  await repo.removeRedemption(orderId);
}

module.exports = {
  listCoupons, getCoupon, createCoupon, updateCoupon, deleteCoupon,
  previewCoupon, validateAndApplyCoupon, removeCouponFromOrder,
};
