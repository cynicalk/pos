const router  = require('express').Router();
const service = require('./labour.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

const adminOnly = [authenticate, authorize('admin')];

router.get('/shifts', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.listShifts(req.user.restaurantId, req.query.from, req.query.to));
}));

router.post('/shifts', ...adminOnly, asyncHandler(async (req, res) => {
  res.status(201).json(await service.logShift(req.user.restaurantId, req.body));
}));

router.delete('/shifts/:id', ...adminOnly, asyncHandler(async (req, res) => {
  await service.deleteShift(req.params.id, req.user.restaurantId);
  res.status(204).end();
}));

router.post('/clock-in', ...adminOnly, asyncHandler(async (req, res) => {
  res.status(201).json(await service.clockIn(
    req.user.restaurantId, req.body.userId, req.body.hourlyRate,
  ));
}));

router.post('/clock-out', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.clockOut(req.user.restaurantId, req.body.userId));
}));

/** Shifts whose clock stamps say the stored hours can't be trusted. */
router.get('/review', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getShiftsForReview(req.user.restaurantId));
}));

router.get('/rates', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.listStaffRates(req.user.restaurantId));
}));

router.patch('/rates/:userId', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.setStaffRate(
    req.params.userId, req.user.restaurantId, req.body.hourlyRate,
  ));
}));

module.exports = router;
