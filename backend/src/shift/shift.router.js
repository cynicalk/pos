const router = require('express').Router();
const service = require('./shift.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { ValidationError } = require('../shared/errors');
const { asyncHandler } = require('../shared/asyncHandler');

// Cash-drawer reconciliation is front-of-house + management only — kitchen has no
// business seeing expected/counted cash. Mirrors the dashboard's RequireNotKitchen
// gate on the Shift pages.
router.use(authenticate, authorize('admin', 'staff', 'cashier'));

router.get('/summary', asyncHandler(async (req, res) => {
  res.json(await service.getSummary(req.user.restaurantId));
}));

router.get('/history', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 500);
  res.json(await service.getHistory(req.user.restaurantId, limit));
}));

router.post('/count', asyncHandler(async (req, res) => {
  const { actualCash, notes, denominations } = req.body;
  const n = parseFloat(actualCash);
  if (isNaN(n) || n < 0) throw new ValidationError('actualCash must be a non-negative number');
  const result = await service.recordCount({
    restaurantId: req.user.restaurantId,
    countedBy:    req.user.userId,
    actualCash:   n,
    notes,
    denominations,
  });
  res.status(201).json(result);
}));

module.exports = router;
