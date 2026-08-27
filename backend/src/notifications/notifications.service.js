const repo = require('./notifications.repository');

const list        = (userId, restaurantId) => repo.listForUser(userId, restaurantId);
const markAllRead = (userId, restaurantId) => repo.markAllRead(userId, restaurantId);
const clearAll    = (userId, restaurantId) => repo.clearForUser(userId, restaurantId);

module.exports = { list, markAllRead, clearAll };
