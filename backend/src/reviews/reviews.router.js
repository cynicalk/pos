const router = require('express').Router();
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');
const service = require('./reviews.service');

router.get('/', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { from, to, rating, timezone } = req.query;
  res.json(await service.list(req.user.restaurantId, { from, to, rating, timezone }));
}));

module.exports = router;
