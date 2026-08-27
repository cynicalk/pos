const router  = require('express').Router();
const service = require('./procurement.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

const adminOnly = [authenticate, authorize('admin')];

// ── Suppliers ──────────────────────────────────────────────────────────────
router.get('/suppliers', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.listSuppliers(req.user.restaurantId));
}));

router.post('/suppliers', ...adminOnly, asyncHandler(async (req, res) => {
  res.status(201).json(await service.createSupplier(req.user.restaurantId, req.body));
}));

router.patch('/suppliers/:id', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.updateSupplier(req.params.id, req.user.restaurantId, req.body));
}));

router.patch('/ingredients/:id/supplier', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.assignIngredient(
    req.params.id, req.user.restaurantId, req.body.supplierId,
  ));
}));

// ── Reorder + suggestions ──────────────────────────────────────────────────
router.get('/reorder', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getReorderPositions(req.user.restaurantId));
}));

router.get('/suggestions', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getPoSuggestions(req.user.restaurantId));
}));

// ── Purchase orders ────────────────────────────────────────────────────────
router.get('/orders', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.listPurchaseOrders(req.user.restaurantId, req.query.status));
}));

router.post('/orders', ...adminOnly, asyncHandler(async (req, res) => {
  res.status(201).json(await service.createPurchaseOrder(
    req.user.restaurantId, req.body, req.user.userId,
  ));
}));

router.patch('/orders/:id/status', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.setPurchaseOrderStatus(
    req.params.id, req.user.restaurantId, req.body.status,
  ));
}));

/** Booking a delivery into stock — separate from status so it can't happen twice. */
router.post('/orders/:id/receive', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.receivePurchaseOrder(
    req.params.id, req.user.restaurantId, req.user.userId,
  ));
}));

// ── Invoice intake + price history ─────────────────────────────────────────
router.post('/invoice', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.importInvoice(req.user.restaurantId, req.body.csv));
}));

router.get('/prices/:ingredientId', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getPriceHistory(req.params.ingredientId, req.user.restaurantId));
}));

module.exports = router;
