const repo = require('./orders.repository');
const tablesService = require('../tables/tables.service');
const tablesRepo = require('../tables/tables.repository'); // raw assignStaff: skip the service's validation/notify (internal table<->order sync)
const menuService = require('../menu/menu.service');
const settingsRepo = require('../settings/settings.repository');
const inventoryService = require('../inventory/inventory.service');
const wasteService = require('../waste/waste.service');
const couponsService = require('../coupons/coupons.service');
const loyaltyService = require('../loyalty/loyalty.service');
const ws = require('../shared/websocket');
const db = require('../shared/db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../shared/errors');
const { validateTimezone } = require('../shared/timezone');

// Persists a notification for all active admins + kitchen users and broadcasts over WebSocket.
async function _notifyAdmins(restaurantId, event, payload) {
  const { rows: recipients } = await db.query(
    `SELECT id FROM users
     WHERE restaurant_id = $1 AND role = ANY($2) AND is_active = true`,
    [restaurantId, ['admin', 'kitchen']],
  );
  await Promise.all(recipients.map((u) =>
    db.query(
      'INSERT INTO staff_notifications (user_id, restaurant_id, event, data) VALUES ($1, $2, $3, $4)',
      [u.id, restaurantId, event, JSON.stringify(payload)],
    ),
  ));
  ws.broadcast(event, payload, restaurantId);
}

async function getById(orderId, restaurantId) {
  const order = await repo.getById(orderId, restaurantId);
  if (!order) throw new NotFoundError('Order');
  return order;
}

async function getActiveByTable(tableId, restaurantId) {
  return repo.getActiveByTable(tableId, restaurantId);
}

async function _resetTableIfEmpty(tableId, restaurantId) {
  if (!tableId) return;
  const remaining = await repo.getActiveByTable(tableId, restaurantId);
  if (remaining.length === 0) {
    await tablesService.updateStatus(tableId, 'available', restaurantId);
    await tablesRepo.assignStaff(tableId, null, restaurantId);
    ws.broadcast('TABLE_UPDATED', { tableId }, restaurantId);
  }
}

async function createOrder({ restaurantId, tableId, createdBy, items, channel = 'dining', customerRef = null, assignedStaffId = null }) {
  // Enforce the "restaurant closed" switch here so every caller is covered —
  // staff terminals, the customer QR menu (PUB1), and the AI assistant.
  const settings = await settingsRepo.getAll(restaurantId);
  if (settings.restaurant_open === 'false') {
    throw new ForbiddenError('Restaurant is currently closed — new orders are paused');
  }

  const VALID_CHANNELS = ['dining', 'takeaway', 'delivery'];
  if (!VALID_CHANNELS.includes(channel)) {
    throw new ValidationError(`Invalid channel: ${channel}`);
  }
  if (channel === 'dining' && !tableId) {
    throw new ValidationError('tableId is required for dining orders');
  }
  if (!items || items.length === 0) {
    throw new ValidationError('At least one item is required');
  }

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new ValidationError('Each item quantity must be a positive integer');
    }
  }

  // Validate all menu items exist and are available for this restaurant
  const menuItems = await menuService.getAvailable(restaurantId);
  const availableIds = new Set(menuItems.map((i) => i.id));
  for (const item of items) {
    if (!availableIds.has(item.menuItemId)) {
      throw new ValidationError(`Menu item ${item.menuItemId} is not available`);
    }
  }

  // Order, its line items, and the recipe stock deduction commit together: if
  // the deduction fails the whole order rolls back (no silent stock drift).
  const order = await db.withTransaction(async (client) => {
    const created = await repo.create(
      { restaurantId, tableId, createdBy, items, channel, customerRef, assignedStaffId },
      client,
    );
    await inventoryService.deductForOrderTx(
      client, created.id, restaurantId,
      items.map((i) => ({ menu_item_id: i.menuItemId, quantity: i.quantity })),
    );
    return created;
  });

  if (tableId) {
    await tablesService.updateStatus(tableId, 'occupied', restaurantId);
    if (assignedStaffId) {
      await tablesRepo.assignStaff(tableId, assignedStaffId, restaurantId);
    }
  }

  // customerPlaced lets a designated kitchen terminal auto-print KOTs only for
  // orders placed from the customer QR menu (no staff at a terminal to print).
  const newOrderPayload = { orderId: order.id, tableId: order.table_id, channel, customerPlaced: !createdBy };

  if (channel === 'dining' && assignedStaffId) {
    // Dine-in with a specific staff assigned — only that staff + every admin and kitchen screen
    ws.broadcastToRolesOrUser('NEW_ORDER', newOrderPayload, restaurantId, ['admin', 'kitchen'], assignedStaffId);
  } else {
    // Delivery, takeaway, or dine-in without an assigned staff → everyone
    ws.broadcast('NEW_ORDER', newOrderPayload, restaurantId);
  }

  return order;
}

async function addItems(orderId, items, restaurantId) {
  const order = await getById(orderId, restaurantId);
  if (['paid', 'cancelled'].includes(order.status)) {
    throw new ValidationError('Cannot add items to a paid or cancelled order');
  }

  const menuItems = await menuService.getAvailable(restaurantId);
  const availableIds = new Set(menuItems.map((i) => i.id));
  for (const item of items) {
    if (!availableIds.has(item.menuItemId)) {
      throw new ValidationError(`Menu item ${item.menuItemId} is not available`);
    }
  }

  // Added items and their stock deduction commit together (atomic-fail).
  await db.withTransaction(async (client) => {
    await repo.addItems(orderId, items, restaurantId, client);
    await inventoryService.deductForOrderTx(
      client, orderId, restaurantId,
      items.map((i) => ({ menu_item_id: i.menuItemId, quantity: i.quantity })),
    );
  });
  // New items on a served order go back to kitchen — reset to received
  if (order.status === 'served') {
    await repo.updateStatus(orderId, 'received', restaurantId);
  }

  ws.broadcast('ORDER_UPDATED', { orderId }, restaurantId);
  return getById(orderId, restaurantId);
}

const ITEM_STATUS_ORDER = ['pending', 'preparing', 'ready', 'served'];
// void    — pending only: kitchen never started it, stock is returned
// wastage — preparing/ready/served: kitchen touched it, stock stays out, waste is logged
const VOID_STATUSES    = ['pending'];
const WASTAGE_STATUSES = ['pending', 'preparing', 'ready', 'served'];
// Bulk "cancel pending" returns stock for items the kitchen hasn't finished —
// matches the "No pending or preparing items to cancel" guard below.
const CANCELLABLE_ITEM_STATUSES = ['pending', 'preparing'];

async function updateItemStatus(orderId, itemId, status, restaurantId, actionType = 'void', cancelReason = null) {
  const validStatuses = [...ITEM_STATUS_ORDER, 'cancelled'];
  if (!validStatuses.includes(status))
    throw new ValidationError(`Invalid item status: ${status}`);
  if (status === 'cancelled' && !['void', 'wastage'].includes(actionType))
    throw new ValidationError('actionType must be void or wastage');

  if (status === 'cancelled') {
    const order = await getById(orderId, restaurantId);
    if (['paid', 'cancelled'].includes(order.status))
      throw new ValidationError('Cannot update items on a paid or cancelled order');

    const [itemRow] = await repo.getItemStatuses(orderId, restaurantId).then((rows) => rows.filter((r) => r.id === itemId));
    if (!itemRow) throw new NotFoundError('Order item');
    const currentStatus = itemRow.status ?? 'pending';

    const allowed = actionType === 'wastage' ? WASTAGE_STATUSES : VOID_STATUSES;
    if (!allowed.includes(currentStatus))
      throw new ValidationError(`Cannot ${actionType} an item that is already ${currentStatus}`);

    const updated = await repo.updateItemStatus(itemId, orderId, 'cancelled', cancelReason || null, restaurantId);
    if (!updated) throw new NotFoundError('Order item');

    if (actionType === 'wastage') {
      // Ingredients already deducted at order creation — log waste for reporting only, no stock change.
      try {
        await wasteService.logWasteFromOrder({
          restaurantId,
          menuItemId:   itemRow.menu_item_id,
          quantity:     itemRow.quantity,
          orderId,
          orderItemId:  itemId,
          cancelReason: cancelReason || null,
        });
      } catch (err) {
        console.error('[wastage-review] create failed for order', orderId, err?.message);
      }
    } else {
      // Void — item was never made, return ingredients to stock.
      inventoryService.returnStock(orderId, restaurantId, [
        { menu_item_id: itemRow.menu_item_id, quantity: itemRow.quantity },
      ]).catch((err) => console.error('[inventory] returnStock failed for order', orderId, err?.message));
    }

    // Notify admins so the action is visible in the notification bell.
    const notifEvent   = actionType === 'wastage' ? 'ITEM_WASTED' : 'ITEM_VOIDED';
    const notifPayload = {
      orderId,
      itemId,
      menuItemName: itemRow.menu_item_name ?? 'item',
      quantity:     itemRow.quantity,
      actionType,
      cancelReason: cancelReason || null,
    };
    _notifyAdmins(restaurantId, notifEvent, notifPayload)
      .catch((err) => console.error('[notify]', notifEvent, 'failed', err?.message));

    // Re-evaluate order status now that this item is gone.
    const allItems  = await repo.getItemStatuses(orderId, restaurantId);
    const remaining = allItems.filter((i) => i.status !== 'cancelled');
    let nextOrderStatus = null;
    if (remaining.length === 0) {
      nextOrderStatus = 'cancelled';
    } else if (remaining.every((i) => (i.status ?? 'pending') === 'served')) {
      nextOrderStatus = 'served';
    } else if (remaining.every((i) => ['ready', 'served'].includes(i.status ?? 'pending'))) {
      nextOrderStatus = 'ready';
    }
    if (nextOrderStatus) {
      await repo.updateStatus(orderId, nextOrderStatus, restaurantId);
      if (nextOrderStatus === 'cancelled') await _resetTableIfEmpty(order.table_id, restaurantId);
    }

    ws.broadcast('ORDER_UPDATED', { orderId }, restaurantId);
    return getById(orderId, restaurantId);
  }

  const order = await getById(orderId, restaurantId);
  if (['paid', 'cancelled'].includes(order.status))
    throw new ValidationError('Cannot update items on a paid or cancelled order');

  const updated = await repo.updateItemStatus(itemId, orderId, status, null, restaurantId);
  if (!updated) throw new NotFoundError('Order item');

  // Auto-advance order status based on collective item state (ignore cancelled)
  const allItems = await repo.getItemStatuses(orderId, restaurantId);
  const statuses = allItems.filter((i) => i.status !== 'cancelled').map((i) => i.status ?? 'pending');
  const allAtLeast = (min) => statuses.every((s) => ITEM_STATUS_ORDER.indexOf(s) >= ITEM_STATUS_ORDER.indexOf(min));

  let nextOrderStatus = null;
  if (allAtLeast('served')   && order.status === 'ready')     nextOrderStatus = 'served';
  else if (allAtLeast('ready')    && order.status === 'preparing') nextOrderStatus = 'ready';
  else if (statuses.some((s) => s === 'preparing') && order.status === 'received') nextOrderStatus = 'preparing';

  if (nextOrderStatus) await repo.updateStatus(orderId, nextOrderStatus, restaurantId);

  ws.broadcast('ORDER_UPDATED', { orderId }, restaurantId);
  return getById(orderId, restaurantId);
}

async function cancelPendingItems(orderId, restaurantId) {
  const order = await getById(orderId, restaurantId);
  if (['paid', 'cancelled'].includes(order.status))
    throw new ValidationError('Cannot cancel a paid or already-cancelled order');

  const allItems = await repo.getItemStatuses(orderId, restaurantId);
  const toCancelIds = allItems
    .filter((i) => CANCELLABLE_ITEM_STATUSES.includes(i.status))
    .map((i) => i.id);

  if (toCancelIds.length === 0)
    throw new ValidationError('No pending or preparing items to cancel');

  for (const itemId of toCancelIds) {
    await repo.updateItemStatus(itemId, orderId, 'cancelled', null, restaurantId);
  }

  inventoryService.returnStock(
    orderId, restaurantId,
    allItems
      .filter((i) => toCancelIds.includes(i.id))
      .map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity })),
  ).catch((err) => console.error('[inventory] returnStock failed for order', orderId, err?.message));

  // Determine what remains
  const remaining = allItems.filter((i) => !toCancelIds.includes(i.id) && i.status !== 'cancelled');

  let nextStatus;
  if (remaining.length === 0) {
    nextStatus = 'cancelled';
  } else if (remaining.every((i) => (i.status ?? 'pending') === 'served')) {
    nextStatus = 'served';
  } else {
    nextStatus = 'ready';
  }
  await repo.updateStatus(orderId, nextStatus, restaurantId);
  if (nextStatus === 'cancelled') await _resetTableIfEmpty(order.table_id, restaurantId);

  ws.broadcast('ORDER_UPDATED', { orderId }, restaurantId);
  return getById(orderId, restaurantId);
}

async function updateStatus(orderId, status, restaurantId) {
  const VALID = ['received', 'preparing', 'ready', 'served', 'paid', 'cancelled'];
  if (!VALID.includes(status))
    throw new ValidationError(`Invalid status: ${status}`);
  const order = await getById(orderId, restaurantId);
  const updated = await repo.updateStatus(orderId, status, restaurantId);
  ws.broadcast('ORDER_STATUS_CHANGED', { orderId, status }, restaurantId);
  if (status === 'cancelled') await _resetTableIfEmpty(order.table_id, restaurantId);
  return updated;
}

async function calculateTotal(orderId, restaurantId) {
  await getById(orderId, restaurantId);
  return repo.calculateTotal(orderId, restaurantId);
}

async function markOrderPaid(orderId, restaurantId) {
  return updateStatus(orderId, 'paid', restaurantId);
}

async function getItems(orderId, restaurantId) {
  await getById(orderId, restaurantId);
  return repo.getItemsByOrderId(orderId, restaurantId);
}

async function getKotData(orderId, restaurantId) {
  const data = await repo.getKotData(orderId, restaurantId);
  if (!data) throw new NotFoundError('Order');
  return data;
}

async function assignStaff(orderId, staffId, restaurantId) {
  const order = await getById(orderId, restaurantId);
  if (staffId !== null) {
    const { rows } = await require('../shared/db').query(
      'SELECT id FROM users WHERE id = $1 AND restaurant_id = $2',
      [staffId, restaurantId],
    );
    if (!rows[0]) throw new NotFoundError('Staff member');
  }
  const updated = await repo.assignStaff(orderId, staffId, restaurantId);
  ws.broadcast('ORDER_UPDATED', { orderId }, restaurantId);
  if (staffId !== null) {
    const { rows: staffRows } = await require('../shared/db').query(
      'SELECT COALESCE(name, email) AS name FROM users WHERE id = $1',
      [staffId],
    );
    const payload = {
      orderId,
      tableNumber: order.table_number ?? null,
      staffName: staffRows[0]?.name ?? null,
    };
    ws.broadcastToRolesOrUser('STAFF_ASSIGNED', payload, restaurantId, ['admin'], staffId);
  }
  return updated;
}

async function applyDiscount(orderId, discountType, discountValue, restaurantId) {
  const VALID_TYPES = ['percent', 'flat'];
  if (discountType !== null && !VALID_TYPES.includes(discountType))
    throw new ValidationError('discount_type must be percent, flat, or null');
  const value = parseFloat(discountValue ?? 0);
  if (isNaN(value) || value < 0)
    throw new ValidationError('discount_value must be a non-negative number');
  if (discountType === 'percent' && value > 100)
    throw new ValidationError('Percent discount cannot exceed 100');

  const order = await getById(orderId, restaurantId);
  if (['paid', 'cancelled'].includes(order.status))
    throw new ValidationError('Cannot modify a paid or cancelled order');

  if (discountType === 'flat') {
    const subtotal = await require('./orders.repository').calculateTotal(orderId, restaurantId);
    if (value > parseFloat(subtotal)) {
      throw new ValidationError('Flat discount cannot exceed the order subtotal');
    }
  }

  return repo.setDiscount(orderId, discountType, value, restaurantId);
}

async function applyCoupon(orderId, code, restaurantId) {
  const order = await getById(orderId, restaurantId);
  if (['paid', 'cancelled'].includes(order.status))
    throw new ValidationError('Cannot modify a paid or cancelled order');
  const subtotal = await repo.calculateTotal(orderId, restaurantId);
  const { couponId, discountAmount } = await couponsService.validateAndApplyCoupon(
    restaurantId, code, subtotal, orderId,
  );
  return repo.setCoupon(orderId, couponId, discountAmount, restaurantId);
}

async function removeCoupon(orderId, restaurantId) {
  const order = await getById(orderId, restaurantId);
  if (['paid', 'cancelled'].includes(order.status))
    throw new ValidationError('Cannot modify a paid or cancelled order');
  await couponsService.removeCouponFromOrder(orderId);
  return repo.clearCoupon(orderId, restaurantId);
}

async function applyLoyalty(orderId, phone, pointsToRedeem, restaurantId) {
  const order = await getById(orderId, restaurantId);
  if (['paid', 'cancelled'].includes(order.status))
    throw new ValidationError('Cannot modify a paid or cancelled order');

  const [settings, subtotal] = await Promise.all([
    settingsRepo.getAll(restaurantId),
    repo.calculateTotal(orderId, restaurantId),
  ]);

  const customer = await loyaltyService.lookupCustomer(restaurantId, phone);
  if (!customer) throw new ValidationError('No loyalty account found for this phone number');

  const n = parseInt(pointsToRedeem || 0);
  let redemptionValue = 0;
  if (n > 0) {
    ({ redemptionValue } = loyaltyService.validateRedemption(customer, n, subtotal, settings));
  }
  return repo.setLoyalty(orderId, customer.id, n, redemptionValue, restaurantId);
}

async function removeLoyalty(orderId, restaurantId) {
  const order = await getById(orderId, restaurantId);
  if (['paid', 'cancelled'].includes(order.status))
    throw new ValidationError('Cannot modify a paid or cancelled order');
  return repo.clearLoyalty(orderId, restaurantId);
}

module.exports = {
  getById,
  getActiveByTable,
  createOrder,
  addItems,
  updateItemStatus,
  cancelPendingItems,
  updateStatus,
  assignStaff,
  calculateTotal,
  markOrderPaid,
  getItems,
  getKotData,
  applyDiscount,
  applyCoupon,
  removeCoupon,
  applyLoyalty,
  removeLoyalty,
  getHistory,
};

async function getHistory(restaurantId, { from, to, status, channel, timezone: tzParam }) {
  const rawTz = tzParam || await settingsRepo.getAll(restaurantId).then((s) => s.timezone || 'UTC');
  const timezone = validateTimezone(rawTz);
  const orders = await repo.getHistory(restaurantId, { from, to, status, channel, timezone });

  const stats = orders.reduce(
    (acc, o) => {
      acc.total += 1;
      if (o.status === 'paid') { acc.paid += 1; acc.revenue += parseFloat(o.total_charged || 0); }
      if (o.status === 'cancelled') acc.cancelled += 1;
      return acc;
    },
    { total: 0, paid: 0, cancelled: 0, revenue: 0 },
  );
  stats.revenue = parseFloat(stats.revenue.toFixed(2));

  return { orders, stats };
}
