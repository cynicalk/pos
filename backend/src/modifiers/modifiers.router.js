const router = require('express').Router();
const service = require('./modifiers.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

router.use(authenticate, authorize('admin'));

router.get('/groups', asyncHandler(async (req, res) => {
  res.json(await service.getGroups(req.user.restaurantId));
}));

router.post('/groups', asyncHandler(async (req, res) => {
  res.status(201).json(await service.createGroup(req.body, req.user.restaurantId));
}));

router.patch('/groups/:id', asyncHandler(async (req, res) => {
  res.json(await service.updateGroup(req.params.id, req.body, req.user.restaurantId));
}));

router.delete('/groups/:id', asyncHandler(async (req, res) => {
  res.json(await service.deleteGroup(req.params.id, req.user.restaurantId));
}));

router.post('/groups/:groupId/options', asyncHandler(async (req, res) => {
  res.status(201).json(await service.addOption(req.params.groupId, req.body, req.user.restaurantId));
}));

router.delete('/options/:id', asyncHandler(async (req, res) => {
  res.json(await service.deleteOption(req.params.id, req.user.restaurantId));
}));

router.get('/overrides/:recipeId', asyncHandler(async (req, res) => {
  res.json(await service.getOverrides(req.params.recipeId, req.user.restaurantId));
}));

router.put('/overrides', asyncHandler(async (req, res) => {
  res.json(await service.upsertOverride(req.body, req.user.restaurantId));
}));

router.delete('/overrides', asyncHandler(async (req, res) => {
  const { recipeId, optionId, ingredientId } = req.body;
  await service.deleteOverride(recipeId, optionId, ingredientId, req.user.restaurantId);
  res.json({ ok: true });
}));

module.exports = router;
