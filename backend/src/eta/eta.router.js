const router  = require('express').Router();
const service = require('./eta.service');
const { authenticate } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

// ETA config + effective weights — what the Settings UI reads to view/tune.
router.get('/config', authenticate, asyncHandler(async (req, res) => {
  const cfg = await service.getConfig(req.user.restaurantId);
  res.json({
    etaEnabled:              cfg.etaEnabled,
    allowExtraChair:         cfg.allowExtraChair,
    reservationBlockEnabled: cfg.reservationBlockEnabled,
    buffer:                  cfg.buffer,
    avgTableTime:            Math.round(cfg.avgTableTime),
    avgSampleCount:          cfg.avgSampleCount,
    weights:                 service.effectiveWeights(cfg.categoryStats, cfg.overrides),
  });
}));

// Live per-table "frees in ~N min" estimates — for the staff floor view.
router.get('/tables', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.getTableEstimates(req.user.restaurantId));
}));

module.exports = router;
