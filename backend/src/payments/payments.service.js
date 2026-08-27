const repo = require('./payments.repository');
const ordersService = require('../orders/orders.service');
const tablesService = require('../tables/tables.service');
const tablesRepo = require('../tables/tables.repository'); // raw assignStaff: skip the service's validation/notify (internal table<->order sync)
const settingsRepo = require('../settings/settings.repository');
const loyaltyService = require('../loyalty/loyalty.service');
const couponsRepo = require('../coupons/coupons.repository');
const ws = require('../shared/websocket');
const db = require('../shared/db');
const { NotFoundError, ValidationError, AppError } = require('../shared/errors');

const VALID_METHODS = ['cash', 'card', 'mobile'];

function computeBill(subtotal, taxRate, serviceChargeRate, discountType = null, discountValue = 0, packagingFee = 0, couponDiscountAmount = 0, loyaltyDiscountAmount = 0) {
  let manualDiscount = 0;
  if (discountType === 'percent') {
    manualDiscount = parseFloat((subtotal * (discountValue / 100)).toFixed(2));
  } else if (discountType === 'flat') {
    manualDiscount = parseFloat(Math.min(discountValue, subtotal).toFixed(2));
  }

  const couponDiscount  = parseFloat(Math.min(parseFloat(couponDiscountAmount  || 0), subtotal).toFixed(2));
  const loyaltyDiscount = parseFloat(Math.min(parseFloat(loyaltyDiscountAmount || 0), subtotal).toFixed(2));
  const totalDiscounts  = parseFloat((manualDiscount + couponDiscount + loyaltyDiscount).toFixed(2));

  const discountedSubtotal = parseFloat(Math.max(subtotal - totalDiscounts, 0).toFixed(2));
  const tax           = parseFloat((discountedSubtotal * taxRate).toFixed(2));
  const serviceCharge = parseFloat((discountedSubtotal * serviceChargeRate).toFixed(2));
  const fee           = parseFloat((packagingFee || 0).toFixed(2));
  const total         = parseFloat((discountedSubtotal + tax + serviceCharge + fee).toFixed(2));

  return {
    subtotal,
    discountType:          discountType || null,
    discountValue:         parseFloat(discountValue) || 0,
    discountAmount:        manualDiscount,
    couponDiscountAmount:  couponDiscount,
    loyaltyDiscountAmount: loyaltyDiscount,
    taxRate,
    taxAmount:             tax,
    serviceChargeRate,
    serviceChargeAmount:   serviceCharge,
    packagingFee:          fee,
    total,
  };
}

// Returns bill for the full order, or for specific order_item IDs (split preview)
async function getBill(orderId, restaurantId, orderItemIds = null, waiveServiceCharge = false) {
  const order = await ordersService.getById(orderId, restaurantId);
  if (!order) throw new NotFoundError('Order');

  const [allItems, settings, couponRow] = await Promise.all([
    ordersService.getItems(orderId, restaurantId),
    settingsRepo.getAll(restaurantId),
    order.coupon_id ? couponsRepo.getById(restaurantId, order.coupon_id) : Promise.resolve(null),
  ]);
  const couponCode = couponRow?.code || null;

  const taxRate           = parseFloat(settings.tax_rate      || '0') / 100;
  const serviceChargeRate = waiveServiceCharge ? 0 : parseFloat(settings.service_charge || '0') / 100;
  const packagingFeeTotal = order.channel !== 'dining'
    ? parseFloat(settings.packaging_fee || '0')
    : 0;

  if (orderItemIds && orderItemIds.length > 0) {
    const items = allItems.filter((i) => orderItemIds.includes(i.id));
    const subtotal      = parseFloat(items.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2));
    const totalSubtotal = parseFloat(allItems.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2));

    // Prorate flat discount, coupon, loyalty, and packaging fee by proportion of subtotal
    let { discount_type: discountType, discount_value: discountValue } = order;
    discountValue = parseFloat(discountValue || 0);
    if (discountType === 'flat' && totalSubtotal > 0) {
      discountValue = parseFloat((discountValue * subtotal / totalSubtotal).toFixed(2));
    }
    const ratio = totalSubtotal > 0 ? subtotal / totalSubtotal : 0;
    const packagingFee    = parseFloat((packagingFeeTotal * ratio).toFixed(2));
    const couponDiscount  = parseFloat((parseFloat(order.coupon_discount_amount  || 0) * ratio).toFixed(2));
    const loyaltyDiscount = parseFloat((parseFloat(order.loyalty_discount_amount || 0) * ratio).toFixed(2));

    const bill = computeBill(subtotal, taxRate, serviceChargeRate, discountType, discountValue, packagingFee, couponDiscount, loyaltyDiscount);
    return { ...bill, items, couponCode };
  }

  const subtotal = await ordersService.calculateTotal(orderId, restaurantId);
  const bill = computeBill(
    subtotal, taxRate, serviceChargeRate,
    order.discount_type, order.discount_value, packagingFeeTotal,
    order.coupon_discount_amount, order.loyalty_discount_amount,
  );
  return { ...bill, items: allItems, couponCode };
}

async function processPayment(orderId, { method, tenders: tendersInput, amountTendered, waiveServiceCharge = false }, restaurantId) {
  let effectiveMethod;
  let effectiveTenders = null;

  if (tendersInput && tendersInput.length > 0) {
    for (const t of tendersInput) {
      if (!VALID_METHODS.includes(t.method)) {
        throw new ValidationError(`method must be one of: ${VALID_METHODS.join(', ')}`);
      }
    }
    effectiveMethod  = tendersInput.map((t) => t.method).join('+');
    effectiveTenders = tendersInput;
  } else {
    if (!VALID_METHODS.includes(method)) {
      throw new ValidationError(`method must be one of: ${VALID_METHODS.join(', ')}`);
    }
    effectiveMethod = method;
  }

  const order = await ordersService.getById(orderId, restaurantId);
  if (!order) throw new NotFoundError('Order');
  if (order.status === 'paid') throw new AppError('Order is already paid', 400);

  const settings          = await settingsRepo.getAll(restaurantId);
  const taxRate           = parseFloat(settings.tax_rate      || '0') / 100;
  const serviceChargeRate = waiveServiceCharge ? 0 : parseFloat(settings.service_charge || '0') / 100;
  const packagingFee      = order.channel !== 'dining'
    ? parseFloat(settings.packaging_fee || '0')
    : 0;
  const subtotal          = await ordersService.calculateTotal(orderId, restaurantId);

  const { taxAmount, serviceChargeAmount, discountAmount, couponDiscountAmount, loyaltyDiscountAmount, total } =
    computeBill(subtotal, taxRate, serviceChargeRate, order.discount_type, order.discount_value, packagingFee,
      order.coupon_discount_amount, order.loyalty_discount_amount);

  if (effectiveTenders) {
    const sum = parseFloat(effectiveTenders.reduce((s, t) => s + t.amount, 0).toFixed(2));
    if (Math.abs(sum - total) > 0.05) {
      throw new ValidationError(`Tenders sum (${sum}) must equal total (${total})`);
    }
  } else if (amountTendered !== undefined && amountTendered < total) {
    throw new ValidationError(`Amount tendered (${amountTendered}) is less than total (${total})`);
  }

  // Serialize against concurrent payments and keep the insert atomic with the
  // status flip: lock the order row, re-check it isn't already paid under that
  // lock, then write the payment and mark the order paid in one transaction.
  // Without the lock two terminals could both pass the status check above and
  // double-charge the order; without the transaction a mid-way failure could
  // leave a completed payment against a still-unpaid order.
  const payment = await db.withTransaction(async (client) => {
    const { rows: [locked] } = await client.query(
      'SELECT status FROM orders WHERE id = $1 AND restaurant_id = $2 FOR UPDATE',
      [orderId, restaurantId],
    );
    if (!locked) throw new NotFoundError('Order');
    if (locked.status === 'paid') throw new AppError('Order is already paid', 400);

    const created = await repo.create({
      orderId, amount: total, method: effectiveMethod,
      subtotal, taxRate, taxAmount,
      serviceChargeRate, serviceChargeAmount,
      discountAmount, couponDiscountAmount, loyaltyDiscountAmount,
      packagingFee, totalCharged: total,
      tenders: effectiveTenders,
    }, client);
    await repo.updateStatus(created.id, 'completed', client);
    await client.query(
      "UPDATE orders SET status = 'paid' WHERE id = $1 AND restaurant_id = $2",
      [orderId, restaurantId],
    );

    // Settle loyalty inside the payment tx so points (redeem + earn) commit or
    // roll back atomically with the charge; an oversell trips the balance CHECK.
    if (order.loyalty_customer_id) {
      await loyaltyService.deductPoints(restaurantId, order.loyalty_customer_id, orderId, order.loyalty_points_redeemed || 0, client);
      await loyaltyService.earnPoints(restaurantId, order.loyalty_customer_id, orderId, subtotal, settings, client);
    }
    return created;
  });

  // Mirror the ORDER_STATUS_CHANGED broadcast markOrderPaid used to emit.
  ws.broadcast('ORDER_STATUS_CHANGED', { orderId, status: 'paid' }, restaurantId);

  // For dining tables with multiple rounds, only fire once when the LAST order is paid.
  // This prevents duplicate PAYMENT_COMPLETED notifications for multi-round sessions.
  if (order.table_id) {
    const remaining = await ordersService.getActiveByTable(order.table_id, restaurantId);
    if (remaining.length === 0) {
      await tablesService.updateStatus(order.table_id, 'available', restaurantId);
      await tablesRepo.assignStaff(order.table_id, null, restaurantId);
      ws.broadcast('PAYMENT_COMPLETED', { orderId, paymentId: payment.id, total }, restaurantId);
    }
  } else {
    ws.broadcast('PAYMENT_COMPLETED', { orderId, paymentId: payment.id, total }, restaurantId);
  }

  return {
    success: true,
    paymentId: payment.id,
    charged: total,
    method: effectiveMethod,
    change: (!effectiveTenders && amountTendered)
      ? parseFloat((amountTendered - total).toFixed(2))
      : 0,
  };
}

// Split bill by items — each split has its own tender(s); order marked paid atomically.
// Each split.items entry is { orderItemId, quantity } — quantities may be partial
// (e.g. 2 of 5 burgers on one split, 3 on the other).
async function processSplitPayment(orderId, { splits, waiveServiceCharge = false }, restaurantId) {
  if (!Array.isArray(splits) || splits.length < 2) {
    throw new ValidationError('Split payment requires at least 2 splits');
  }

  const order = await ordersService.getById(orderId, restaurantId);
  if (!order) throw new NotFoundError('Order');
  if (order.status === 'paid') throw new AppError('Order is already paid', 400);

  const [allItems, settings] = await Promise.all([
    ordersService.getItems(orderId, restaurantId),
    settingsRepo.getAll(restaurantId),
  ]);

  const taxRate           = parseFloat(settings.tax_rate      || '0') / 100;
  const serviceChargeRate = waiveServiceCharge ? 0 : parseFloat(settings.service_charge || '0') / 100;
  const packagingFeeTotal = order.channel !== 'dining'
    ? parseFloat(settings.packaging_fee || '0')
    : 0;
  const totalSubtotal     = parseFloat(allItems.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2));

  // Validate that quantities for each item sum to the full ordered quantity
  const itemMap = new Map(allItems.map((i) => [i.id, i]));
  for (const [id, fullItem] of itemMap) {
    const assigned = splits.reduce((sum, split) => {
      const si = (split.items || []).find((i) => i.orderItemId === id);
      return sum + (si ? Math.max(0, parseInt(si.quantity) || 0) : 0);
    }, 0);
    if (assigned !== parseInt(fullItem.quantity)) {
      throw new ValidationError(
        `Quantities for "${fullItem.name}" don't add up (assigned ${assigned}, ordered ${fullItem.quantity})`,
      );
    }
  }

  const paymentPayloads = [];

  for (const split of splits) {
    const { items: splitItemDefs, tenders } = split;
    if (!splitItemDefs?.length) throw new ValidationError('Each split must have at least one item');
    if (!tenders?.length)       throw new ValidationError('Each split must have at least one tender');

    for (const t of tenders) {
      if (!VALID_METHODS.includes(t.method)) {
        throw new ValidationError(`method must be one of: ${VALID_METHODS.join(', ')}`);
      }
    }

    // Build split items with the partial (or full) quantities requested
    const splitItems = splitItemDefs
      .map(({ orderItemId, quantity }) => {
        const full = itemMap.get(orderItemId);
        if (!full) throw new ValidationError(`Item ${orderItemId} not found in order`);
        return { ...full, quantity: parseInt(quantity) };
      })
      .filter((i) => i.quantity > 0);

    const splitSubtotal = parseFloat(splitItems.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2));

    // Prorate flat discount proportionally; percent applies naturally
    let discountType  = order.discount_type;
    let discountValue = parseFloat(order.discount_value || 0);
    if (discountType === 'flat' && totalSubtotal > 0) {
      discountValue = parseFloat((discountValue * splitSubtotal / totalSubtotal).toFixed(2));
    }

    // Prorate packaging fee, coupon, and loyalty by proportion of this split's subtotal
    const splitRatio      = totalSubtotal > 0 ? splitSubtotal / totalSubtotal : 0;
    const packagingFee    = parseFloat((packagingFeeTotal * splitRatio).toFixed(2));
    const couponDiscount  = parseFloat((parseFloat(order.coupon_discount_amount  || 0) * splitRatio).toFixed(2));
    const loyaltyDiscount = parseFloat((parseFloat(order.loyalty_discount_amount || 0) * splitRatio).toFixed(2));

    const { taxAmount, serviceChargeAmount, discountAmount, couponDiscountAmount, loyaltyDiscountAmount, total } =
      computeBill(splitSubtotal, taxRate, serviceChargeRate, discountType, discountValue, packagingFee, couponDiscount, loyaltyDiscount);

    const tendersSum = parseFloat(tenders.reduce((s, t) => s + t.amount, 0).toFixed(2));
    if (Math.abs(tendersSum - total) > 0.05) {
      throw new ValidationError(`Split tenders sum (${tendersSum}) must equal split total (${total})`);
    }

    const method = tenders.length === 1
      ? tenders[0].method
      : tenders.map((t) => t.method).join('+');

    paymentPayloads.push({
      payload: {
        orderId, amount: total, method,
        subtotal: splitSubtotal, taxRate, taxAmount,
        serviceChargeRate, serviceChargeAmount,
        discountAmount, couponDiscountAmount, loyaltyDiscountAmount,
        packagingFee, totalCharged: total,
        tenders: tenders.length > 1 ? tenders : null,
      },
      charged: total,
      method,
    });
  }

  // Insert every split payment and flip the order to paid atomically, under the
  // same order-row lock the single-payment path uses — guards against a
  // concurrent full or split payment double-charging the same order.
  const payments = await db.withTransaction(async (client) => {
    const { rows: [locked] } = await client.query(
      'SELECT status FROM orders WHERE id = $1 AND restaurant_id = $2 FOR UPDATE',
      [orderId, restaurantId],
    );
    if (!locked) throw new NotFoundError('Order');
    if (locked.status === 'paid') throw new AppError('Order is already paid', 400);

    const created = [];
    for (const { payload, charged, method } of paymentPayloads) {
      const payment = await repo.create(payload, client);
      await repo.updateStatus(payment.id, 'completed', client);
      created.push({ paymentId: payment.id, charged, method });
    }
    await client.query(
      "UPDATE orders SET status = 'paid' WHERE id = $1 AND restaurant_id = $2",
      [orderId, restaurantId],
    );

    // Settle loyalty inside the payment tx (atomic with the charge). Earn is on
    // the full order subtotal, not the per-split amounts.
    if (order.loyalty_customer_id) {
      const fullSubtotal = parseFloat(allItems.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2));
      await loyaltyService.deductPoints(restaurantId, order.loyalty_customer_id, orderId, order.loyalty_points_redeemed || 0, client);
      await loyaltyService.earnPoints(restaurantId, order.loyalty_customer_id, orderId, fullSubtotal, settings, client);
    }
    return created;
  });

  // Mirror the ORDER_STATUS_CHANGED broadcast markOrderPaid used to emit.
  ws.broadcast('ORDER_STATUS_CHANGED', { orderId, status: 'paid' }, restaurantId);

  if (order.table_id) {
    await tablesService.updateStatus(order.table_id, 'available', restaurantId);
    await tablesRepo.assignStaff(order.table_id, null, restaurantId);
  }

  const totalCharged = parseFloat(payments.reduce((s, p) => s + p.charged, 0).toFixed(2));
  ws.broadcast('PAYMENT_COMPLETED', { orderId, total: totalCharged }, restaurantId);

  return { success: true, splits: payments, totalCharged };
}

async function getPaymentsForOrder(orderId, restaurantId) {
  await ordersService.getById(orderId, restaurantId);
  return repo.getByOrderId(orderId);
}

async function getReceipt(orderId, restaurantId) {
  const [receipt, settings] = await Promise.all([
    repo.getReceiptData(orderId, restaurantId),
    settingsRepo.getAll(restaurantId),
  ]);
  if (!receipt) throw new NotFoundError('Receipt not found — order may not be paid yet');
  return { ...receipt, timezone: settings.timezone || 'UTC' };
}

module.exports = { computeBill, getBill, processPayment, processSplitPayment, getPaymentsForOrder, getReceipt };
