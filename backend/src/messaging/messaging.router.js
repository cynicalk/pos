const router = require('express').Router();
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');
const service = require('./messaging.service');
const { STATUSES } = require('../modules/messaging/outbox');
const { ValidationError } = require('../shared/errors');

/*
 * The outbox — a read surface for the persisted outbound queue. Admin-only:
 * it lists guest phone numbers and message bodies.
 */

router.get('/outbox', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const status = req.query.status || null;
  if (status && !STATUSES.includes(status)) throw new ValidationError('Invalid outbox status');
  res.json(await service.getOutbox(req.user.restaurantId, { status }));
}));

module.exports = router;
