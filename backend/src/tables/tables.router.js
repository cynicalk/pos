const router = require('express').Router();
const service = require('./tables.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

router.get('/', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.getAll(req.user.restaurantId));
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.getById(req.params.id, req.user.restaurantId));
}));

router.post('/', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const table = await service.create(req.body, req.user.restaurantId);
  res.status(201).json(table);
}));

router.patch('/:id/status', authenticate, asyncHandler(async (req, res) => {
  const { status, reservation } = req.body;
  res.json(await service.updateStatus(req.params.id, status, req.user.restaurantId, reservation ?? null));
}));

router.patch('/:id/position', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { x, y } = req.body;
  res.json(await service.updatePosition(req.params.id, x ?? null, y ?? null, req.user.restaurantId));
}));

router.patch('/:id/assign', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const staffId = req.body.staffId ?? null;
  res.json(await service.assignStaff(req.params.id, staffId, req.user.restaurantId));
}));

router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user.restaurantId);
  res.status(204).send();
}));

module.exports = router;
