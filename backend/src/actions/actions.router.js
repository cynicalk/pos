const router  = require('express').Router();
const service = require('./actions.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

const adminOnly = [authenticate, authorize('admin')];

/** Open actions, ranked by rupee impact where one can be defended. */
router.get('/', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.list(req.user.restaurantId, req.query.status));
}));

/**
 * Force an evaluation pass. The scheduler runs this periodically; the endpoint
 * exists so an operator can pull fresh findings without waiting for the timer.
 */
router.post('/evaluate', ...adminOnly, asyncHandler(async (req, res) => {
  res.json({ created: await service.evaluate(req.user.restaurantId) });
}));

router.patch('/:id/status', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.setStatus(req.params.id, req.user.restaurantId, req.body.status));
}));

router.patch('/:id/assign', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.assign(req.params.id, req.user.restaurantId, req.body.userId));
}));

module.exports = router;
