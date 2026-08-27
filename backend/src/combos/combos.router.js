const router = require('express').Router();
const service = require('./combos.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

router.use(authenticate, authorize('admin'));

router.get('/', asyncHandler(async (req, res) => {
  res.json(await service.getAll(req.user.restaurantId));
}));

router.post('/', asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.body, req.user.restaurantId));
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  res.json(await service.update(req.params.id, req.body, req.user.restaurantId));
}));

module.exports = router;
