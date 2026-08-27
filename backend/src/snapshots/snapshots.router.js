const router  = require('express').Router();
const service = require('./snapshots.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

const adminOnly = [authenticate, authorize('admin')];

/**
 * History depth for this restaurant.
 *
 * This is what the Phase 1 `collecting` shells render instead of a placeholder
 * chart: a true count of closed days stored against the depth forecasting
 * actually needs. Every number here is measured — none is projected.
 */
router.get('/coverage', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getCoverage(req.user.restaurantId));
}));

module.exports = router;
