const router  = require('express').Router();
const service = require('./actions.service');
const aiRepo  = require('../ai/ai.repository');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

const adminOnly = [authenticate, authorize('admin')];

/** Open actions, ranked by rupee impact where one can be defended. */
router.get('/', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.list(req.user.restaurantId, req.query.status));
}));

/** AI-narrated plan over the ranked open actions. Gated by the AI switch. */
router.get('/brief', ...adminOnly, asyncHandler(async (req, res) => {
  if (!(await aiRepo.getAiEnabled(req.user.restaurantId))) {
    return res.status(403).json({ error: 'The AI assistant is disabled for this restaurant' });
  }
  res.json(await service.getActionBrief(req.user.restaurantId));
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
