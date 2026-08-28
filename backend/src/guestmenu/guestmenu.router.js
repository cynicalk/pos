const router = require('express').Router();
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');
const service = require('./guestmenu.service');

/*
 * Guest-surface routes (MERGE_PLAN.md Phase 7).
 *
 * Operator-facing only. The GUEST-facing read is mounted on public.router
 * instead, because that router already carries the CORS policy, the rate
 * limiters and the no-auth contract the table QR flow needs — adding a second
 * unauthenticated surface here would mean two places to get that right.
 */

router.get('/declarations', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.getDeclarations(req.user.restaurantId));
}));

router.put('/declarations/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.declareIngredient(
    req.user.restaurantId, req.params.id, req.body, req.user.userId,
  ));
}));

router.get('/translations', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.getTranslationStatus(req.user.restaurantId));
}));

router.post('/translations/:language', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.translateMenu(req.user.restaurantId, req.params.language));
}));

router.get('/nutrition', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.getNutrition(req.user.restaurantId));
}));

// The operator's preview of exactly what a guest sees, filters and all.
router.get('/preview', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const avoid = req.query.avoid ? String(req.query.avoid).split(',') : [];
  res.json(await service.getGuestMenu(req.user.restaurantId, {
    language: req.query.language, diet: req.query.diet || null, avoid,
  }));
}));

module.exports = router;
