const router = require('express').Router();
const service = require('./payments.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const audit = require('../shared/audit');
const { asyncHandler } = require('../shared/asyncHandler');

// Taking money is a front-of-house action — kitchen has no business here.
const canTakePayment = authorize('admin', 'staff', 'cashier');

router.post('/:orderId/split', authenticate, canTakePayment, asyncHandler(async (req, res) => {
  const result = await service.processSplitPayment(req.params.orderId, req.body, req.user.restaurantId);
  audit.log({
    actorType: 'user', actorId: req.user.userId, restaurantId: req.user.restaurantId,
    action: 'payment', resourceType: 'payment', resourceId: req.params.orderId,
    description: `Split payment processed — ${result.splits.length} bills, total ${result.totalCharged}`,
  });
  res.json(result);
}));

router.post('/:orderId', authenticate, canTakePayment, asyncHandler(async (req, res) => {
  const result = await service.processPayment(req.params.orderId, req.body, req.user.restaurantId);
  const methodLabel = req.body.tenders
    ? req.body.tenders.map((t) => t.method).join('+')
    : req.body.method;
  audit.log({
    actorType: 'user', actorId: req.user.userId, restaurantId: req.user.restaurantId,
    action: 'payment', resourceType: 'payment', resourceId: req.params.orderId,
    description: `Payment processed — ${methodLabel}, total ${result.charged}`,
  });
  res.json(result);
}));

router.get('/:orderId/receipt', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.getReceipt(req.params.orderId, req.user.restaurantId));
}));

router.get('/:orderId/bill', authenticate, asyncHandler(async (req, res) => {
  const itemIds = req.query.itemIds ? req.query.itemIds.split(',').filter(Boolean) : null;
  const waiveServiceCharge = req.query.waive === 'true';
  res.json(await service.getBill(req.params.orderId, req.user.restaurantId, itemIds, waiveServiceCharge));
}));

router.get('/:orderId', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.getPaymentsForOrder(req.params.orderId, req.user.restaurantId));
}));

module.exports = router;
