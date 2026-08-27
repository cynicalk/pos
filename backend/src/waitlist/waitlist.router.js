const router  = require('express').Router();
const service = require('./waitlist.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

// Live queue with per-party ETA + position.
router.get('/', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.list(req.user.restaurantId));
}));

// Staff adds a walk-in (e.g. phone-in or guest without the door QR).
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { guestName, guestPhone, partySize, allowExtraChair, whatsappOptIn, prefs } = req.body;
  const entry = await service.join(req.user.restaurantId, {
    guestName, guestPhone, partySize, allowExtraChair, whatsappOptIn, prefs,
  });
  res.status(201).json(entry);
}));

router.post('/:id/seat', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.seat(req.params.id, req.user.restaurantId, req.body.tableId));
}));

router.post('/:id/cancel', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.cancel(req.params.id, req.user.restaurantId));
}));

router.post('/:id/no-show', authenticate, authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  res.json(await service.noShow(req.params.id, req.user.restaurantId));
}));

module.exports = router;
