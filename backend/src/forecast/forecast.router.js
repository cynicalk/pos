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

router.get('/inventory', ...adminOnly, asyncHandler(async (req, res) => {
  const horizonDays = req.query.horizon ? Number(req.query.horizon) : undefined;
  res.json(await service.getInventoryForecast(req.user.restaurantId, { date: req.query.date, horizonDays }));
}));

router.get('/reorder', ...adminOnly, asyncHandler(async (req, res) => {
  const leadDays = req.query.lead ? Number(req.query.lead) : undefined;
  res.json(await service.getReorderPlan(req.user.restaurantId, { date: req.query.date, leadDays }));
}));

router.get('/shift-plan', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getShiftPlan(req.user.restaurantId, { date: req.query.date }));
}));

router.get('/scheduling', ...adminOnly, asyncHandler(async (req, res) => {
  const days = req.query.days ? Number(req.query.days) : undefined;
  res.json(await service.getScheduling(req.user.restaurantId, { date: req.query.date, days }));
}));

module.exports = router;
