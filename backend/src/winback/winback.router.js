const router = require('express').Router();
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');
const service = require('./winback.service');

/*
 * Winback offers (guests-loyalty). Operator-facing: the offer is printed and
 * handed over, so there is no guest-facing route here — redemption happens
 * through the ordinary coupon path at the till.
 */

router.get('/offers', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.listOffers(req.user.restaurantId));
}));

router.post('/offers', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.status(201).json(await service.createOffer(
    req.user.restaurantId, req.body.customerId, req.user.userId,
  ));
}));

module.exports = router;
