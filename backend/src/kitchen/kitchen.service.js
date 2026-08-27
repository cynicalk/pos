const repo = require('./kitchen.repository');
const ordersService = require('../orders/orders.service');
const ws = require('../shared/websocket');

async function getKitchenQueue(restaurantId) {
  return repo.getPendingItems(restaurantId);
}

async function markOrderPreparing(orderId, restaurantId) {
  const updated = await ordersService.updateStatus(orderId, 'preparing', restaurantId);
  ws.broadcast('ORDER_PREPARING', { orderId }, restaurantId);
  return updated;
}

async function markOrderReady(orderId, restaurantId) {
  const updated = await ordersService.updateStatus(orderId, 'ready', restaurantId);
  ws.broadcast('ORDER_READY', { orderId }, restaurantId);
  return updated;
}

async function markOrderServed(orderId, restaurantId) {
  const updated = await ordersService.updateStatus(orderId, 'served', restaurantId);
  ws.broadcast('ORDER_SERVED', { orderId }, restaurantId);
  return updated;
}

module.exports = { getKitchenQueue, markOrderPreparing, markOrderReady, markOrderServed };
