const router = require('express').Router();
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');
const service = require('./prep.service');

/*
 * Prep logging + reconciliation. Admin/manager surface — it drives kitchen prep
 * quantities and reads sales, so it stays behind the same authorization as the
 * rest of the forecasting set.
 */

router.get('/plan', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.getPlanningSheet(req.user.restaurantId, { date: req.query.date }));
}));

router.post('/plan', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.savePlanned(req.user.restaurantId, {
    date: req.body.date, entries: req.body.entries, userId: req.user.userId,
  }));
}));

router.post('/actual', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.saveActual(req.user.restaurantId, {
    date: req.body.date, entries: req.body.entries, userId: req.user.userId,
  }));
}));

router.get('/reconciliation', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.getReconciliation(req.user.restaurantId, { date: req.query.date }));
}));

router.get('/forecast', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.getPrepForecast(req.user.restaurantId, { date: req.query.date }));
}));

module.exports = router;
