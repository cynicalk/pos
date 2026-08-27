const router = require('express').Router();
const service = require('./inventory.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

router.use(authenticate, authorize('admin'));

router.get('/transactions', asyncHandler(async (req, res) => {
  res.json(
    await service.getTransactions(req.user.restaurantId, {
      ingredientId: req.query.ingredientId || null,
      txnType:      req.query.type         || null,
      from:         req.query.from         || null,
      to:           req.query.to           || null,
      limit:        parseInt(req.query.limit, 10) || 100,
      tz:           req.query.tz,
    }),
  );
}));

router.post('/adjustment', asyncHandler(async (req, res) => {
  res.status(201).json(
    await service.recordAdjustment({
      ...req.body,
      restaurantId: req.user.restaurantId,
      performedBy:  req.user.userId,
    }),
  );
}));

router.post('/import', asyncHandler(async (req, res) => {
  res.status(201).json(
    await service.importTransactions({
      restaurantId: req.user.restaurantId,
      performedBy:  req.user.userId,
      rows:         req.body.rows,
    }),
  );
}));

router.get('/waste-report', asyncHandler(async (req, res) => {
  res.json(
    await service.getWasteReport(req.user.restaurantId, {
      from: req.query.from || null,
      to:   req.query.to   || null,
      tz:   req.query.tz,
    }),
  );
}));

module.exports = router;
