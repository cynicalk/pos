const router = require('express').Router();
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');
const service = require('./group.service');

/*
 * Group rollup routes (MERGE_PLAN.md Phase 7).
 *
 * Admin-only. The grant boundary is applied from req.user.id inside the
 * service — there is deliberately no way to ask for another user's view, and no
 * outlet id parameter to tamper with.
 */

router.get('/', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.getRollup(req.user, { days: req.query.days }));
}));

module.exports = router;
