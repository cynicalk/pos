const router  = require('express').Router();
const service = require('./reports.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

const adminOnly = [authenticate, authorize('admin')];

router.get('/daily', ...adminOnly, asyncHandler(async (req, res) => {
  const { date, tz = 'UTC', channel } = req.query;
  const d = date || new Date().toISOString().split('T')[0];
  res.json(await service.getDailySummary(d, tz, req.user.restaurantId, channel));
}));

router.get('/trends', ...adminOnly, asyncHandler(async (req, res) => {
  const { from, to, tz = 'UTC', group = 'day', channel } = req.query;
  res.json(await service.getTrends(from, to, tz, group, req.user.restaurantId, channel));
}));

router.get('/items', ...adminOnly, asyncHandler(async (req, res) => {
  const { from, to, tz = 'UTC', limit, channel } = req.query;
  res.json(await service.getItemProfitability(from, to, tz, limit, req.user.restaurantId, channel));
}));

router.get('/staff', ...adminOnly, asyncHandler(async (req, res) => {
  const { from, to, tz = 'UTC', channel } = req.query;
  res.json(await service.getStaffPerformance(from, to, tz, req.user.restaurantId, channel));
}));

router.get('/items-trend', ...adminOnly, asyncHandler(async (req, res) => {
  const { from, to, tz = 'UTC', group = 'day', limit, channel } = req.query;
  res.json(await service.getItemsByPeriod(from, to, tz, group, limit, req.user.restaurantId, channel));
}));

router.get('/staff-trend', ...adminOnly, asyncHandler(async (req, res) => {
  const { from, to, tz = 'UTC', group = 'day', channel } = req.query;
  res.json(await service.getStaffByPeriod(from, to, tz, group, req.user.restaurantId, channel));
}));

router.get('/sales-summary', ...adminOnly, asyncHandler(async (req, res) => {
  const { from, to, tz = 'UTC', channel } = req.query;
  res.json(await service.getSalesSummaryReport(from, to, tz, req.user.restaurantId, channel));
}));

router.get('/collection', ...adminOnly, asyncHandler(async (req, res) => {
  const { from, to, tz = 'UTC', channel } = req.query;
  res.json(await service.getCollectionReport(from, to, tz, req.user.restaurantId, channel));
}));

router.get('/item-groups', ...adminOnly, asyncHandler(async (req, res) => {
  const { from, to, tz = 'UTC', limit, channel } = req.query;
  res.json(await service.getItemGroupsReport(from, to, tz, limit, req.user.restaurantId, channel));
}));

router.get('/table-wise', ...adminOnly, asyncHandler(async (req, res) => {
  const { from, to, tz = 'UTC' } = req.query;
  res.json(await service.getTableWiseSalesReport(from, to, tz, req.user.restaurantId));
}));

router.get('/nc-sales', ...adminOnly, asyncHandler(async (req, res) => {
  const { from, to, tz = 'UTC', channel } = req.query;
  res.json(await service.getNCSalesReport(from, to, tz, req.user.restaurantId, channel));
}));

// Theoretical-vs-actual food-cost variance between two finalized stock counts.
router.get('/food-cost-variance', ...adminOnly, asyncHandler(async (req, res) => {
  const { closingCountId, openingCountId } = req.query;
  res.json(await service.getFoodCostVariance(closingCountId, openingCountId, req.user.restaurantId));
}));

module.exports = router;
