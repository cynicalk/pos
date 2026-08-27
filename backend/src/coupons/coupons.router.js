const router = require('express').Router();
const service = require('./coupons.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

// Preview a coupon (no side effects) — cashier + admin
router.get('/preview', authenticate, authorize('admin', 'staff', 'cashier'), asyncHandler(async (req, res) => {
  const { code, subtotal } = req.query;
  res.json(await service.previewCoupon(req.user.restaurantId, code, subtotal));
}));

// List coupons — admin
router.get('/', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.listCoupons(req.user.restaurantId, req.query));
}));

// Create coupon — admin
router.post('/', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.status(201).json(await service.createCoupon(req.user.restaurantId, req.body));
}));

// Get single coupon — admin
router.get('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.getCoupon(req.user.restaurantId, req.params.id));
}));

// Update coupon — admin
router.patch('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.updateCoupon(req.user.restaurantId, req.params.id, req.body));
}));

// Delete coupon — admin
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  await service.deleteCoupon(req.user.restaurantId, req.params.id);
  res.status(204).end();
}));

module.exports = router;
