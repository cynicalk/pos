const router = require('express').Router();
const service = require('./kitchen.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

router.get('/queue', authenticate, authorize('admin', 'kitchen', 'staff', 'cashier'), asyncHandler(async (req, res) => {
  res.json(await service.getKitchenQueue(req.user.restaurantId));
}));

router.patch('/:orderId/preparing', authenticate, authorize('admin', 'kitchen'), asyncHandler(async (req, res) => {
  res.json(await service.markOrderPreparing(req.params.orderId, req.user.restaurantId));
}));

router.patch('/:orderId/ready', authenticate, authorize('admin', 'kitchen'), asyncHandler(async (req, res) => {
  res.json(await service.markOrderReady(req.params.orderId, req.user.restaurantId));
}));

router.patch('/:orderId/served', authenticate, authorize('admin', 'kitchen', 'staff'), asyncHandler(async (req, res) => {
  res.json(await service.markOrderServed(req.params.orderId, req.user.restaurantId));
}));

module.exports = router;
