const router = require('express').Router();
const { authenticate } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');
const service = require('./notifications.service');

// GET /api/notifications — recent notifications for the current user
router.get('/', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.list(req.user.userId, req.user.restaurantId));
}));

// PATCH /api/notifications/read-all — mark all as read
router.patch('/read-all', authenticate, asyncHandler(async (req, res) => {
  await service.markAllRead(req.user.userId, req.user.restaurantId);
  res.json({ ok: true });
}));

// DELETE /api/notifications — clear all for current user
router.delete('/', authenticate, asyncHandler(async (req, res) => {
  await service.clearAll(req.user.userId, req.user.restaurantId);
  res.json({ ok: true });
}));

module.exports = router;
