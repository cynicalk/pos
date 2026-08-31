const router  = require('express').Router();
const service = require('./insights.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

const adminOnly = [authenticate, authorize('admin')];

// Everything here derives from orders the POS already took — no operator input,
// no uploads. All of it is tenant-scoped through req.user.restaurantId.

router.get('/economics', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getEconomics(req.user.restaurantId, req.query.days));
}));

router.get('/menu', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getMenuInsights(req.user.restaurantId, req.query.days));
}));

router.get('/cross-sell', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getCrossSell(req.user.restaurantId, req.query.days));
}));

router.get('/new-items', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getNewItems(req.user.restaurantId, req.query.days));
}));

router.get('/service-hours', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getServiceHours(
    req.user.restaurantId, req.query.days, req.query.channel,
  ));
}));

router.get('/coupon-economics', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getCouponEconomics(req.user.restaurantId, req.query.days));
}));

router.get('/attach', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getAttachRate(req.user.restaurantId, req.query.days));
}));

router.get('/reco-performance', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getRecoPerformance(req.user.restaurantId, req.query.days));
}));

module.exports = router;
