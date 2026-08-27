const router  = require('express').Router();
const service = require('./forecast.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

const adminOnly = [authenticate, authorize('admin')];

// Tier 0 only — seasonal naive, weekday x level. Everything here derives from
// daily_snapshots and the operator's own recipes. No model is called, and every
// payload says which forecaster produced it.

router.get('/demand', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getDemand(req.user.restaurantId, { date: req.query.date }));
}));

router.get('/prep-sheet', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getPrepSheet(req.user.restaurantId, { date: req.query.date }));
}));

router.get('/capacity', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getCapacity(req.user.restaurantId, { date: req.query.date }));
}));

module.exports = router;
