const router  = require('express').Router();
const service = require('./reservations.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { date, status, tz } = req.query;
  res.json(await service.getAll(req.user.restaurantId, { date, status, tz }));
}));

router.post('/', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { tableId, guestName, guestPhone, partySize, reservedAt, notes } = req.body;
  const r = await service.create(req.user.restaurantId, { tableId, guestName, guestPhone, partySize, reservedAt, notes });
  res.status(201).json(r);
}));

router.patch('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { guestName, guestPhone, partySize, reservedAt, notes, tableId } = req.body;
  res.json(await service.update(req.params.id, req.user.restaurantId, { guestName, guestPhone, partySize, reservedAt, notes, tableId }));
}));

router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user.restaurantId);
  res.status(204).send();
}));

router.post('/:id/seat', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.seat(req.params.id, req.user.restaurantId));
}));

router.post('/:id/cancel', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.cancel(req.params.id, req.user.restaurantId));
}));

router.post('/:id/no-show', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.noShow(req.params.id, req.user.restaurantId));
}));

module.exports = router;
