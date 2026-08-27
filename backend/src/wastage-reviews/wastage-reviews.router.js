const router  = require('express').Router();
const service = require('./wastage-reviews.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

router.use(authenticate);

router.get('/', authorize('admin', 'staff', 'cashier'), asyncHandler(async (req, res) => {
  const { status } = req.query;
  res.json(await service.listReviews(req.user.restaurantId, { status }));
}));

router.post('/:id/resolve', authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.resolveReview(req.params.id, {
    restaurantId: req.user.restaurantId,
    reviewedBy:   req.user.userId,
    ingredients:  req.body.ingredients,
  }));
}));

module.exports = router;
