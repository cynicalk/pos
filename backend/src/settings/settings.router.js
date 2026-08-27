const { Router } = require('express');
const { authenticate, authorize } = require('../shared/middleware/auth');
const service = require('./settings.service');
const audit = require('../shared/audit');
const ws = require('../shared/websocket');
const { asyncHandler } = require('../shared/asyncHandler');

const router = Router();

router.get('/', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.getAll(req.user.restaurantId));
}));

router.get('/fx-rate', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.getFxRate(String(req.query.to || '').toUpperCase()));
}));

router.patch('/', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { key, value } = req.body;
  const result = await service.update(key, value, req.user.restaurantId);
  audit.log({
    actorType: 'user', actorId: req.user.userId, restaurantId: req.user.restaurantId,
    action: 'update', resourceType: 'setting', resourceId: key,
    description: `Set ${key} to "${value}"`,
  });
  ws.broadcast('SETTINGS_UPDATED', result, req.user.restaurantId);
  res.json(result);
}));

module.exports = router;
