const router = require('express').Router();
const service = require('./waste.service');
const insightsService = require('./waste-insights.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');
const audit = require('../shared/audit');

router.use(authenticate, authorize('admin', 'staff'));

router.get('/', asyncHandler(async (req, res) => {
  res.json(await service.getAll(req.user.restaurantId, { from: req.query.from, to: req.query.to, tz: req.query.tz }));
}));

// ── AI waste insights (admin only) ───────────────────────────────────────────
router.get('/insights', authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await insightsService.getLatest(req.user.restaurantId));
}));

router.post('/insights/generate', authorize('admin'), asyncHandler(async (req, res) => {
  const insight = await insightsService.generate(req.user.restaurantId, 'manual');
  audit.log({
    actorType: 'user', actorId: req.user.userId, restaurantId: req.user.restaurantId,
    action: 'create', resourceType: 'waste_insight', resourceId: insight?.id ?? null,
    description: 'Generated AI waste insight',
  });
  res.status(201).json(insight);
}));

router.post('/', asyncHandler(async (req, res) => {
  res.status(201).json(
    await service.logWaste({
      ...req.body,
      loggedBy:     req.user.userId,
      restaurantId: req.user.restaurantId,
    }),
  );
}));

router.post('/by-menu-item', asyncHandler(async (req, res) => {
  res.status(201).json(
    await service.logWasteByMenuItem({
      ...req.body,
      loggedBy:     req.user.userId,
      restaurantId: req.user.restaurantId,
    }),
  );
}));

module.exports = router;
