const router = require('express').Router();
const service = require('./loyalty.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

// --- Tiers ---

router.get('/tiers', authenticate, authorize('admin', 'staff', 'cashier'), asyncHandler(async (req, res) => {
  res.json(await service.listTiers(req.user.restaurantId));
}));

router.put('/tiers', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.saveTiers(req.user.restaurantId, req.body));
}));

// --- Rewards ---

router.get('/rewards', authenticate, authorize('admin', 'staff', 'cashier'), asyncHandler(async (req, res) => {
  res.json(await service.listRewards(req.user.restaurantId));
}));

router.put('/rewards', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.saveRewards(req.user.restaurantId, req.body));
}));

// --- Customers ---

// Lookup by phone — cashier + admin
router.get('/customers/lookup', authenticate, authorize('admin', 'staff', 'cashier'), asyncHandler(async (req, res) => {
  const customer = await service.lookupCustomer(req.user.restaurantId, req.query.phone);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
}));

// List all customers — admin only
router.get('/customers', authenticate, authorize('admin', 'staff', 'cashier'), asyncHandler(async (req, res) => {
  const { search, limit, offset } = req.query;
  res.json(await service.listCustomers(req.user.restaurantId, {
    search, limit: parseInt(limit) || 50, offset: parseInt(offset) || 0,
  }));
}));

// Get or create customer — cashier + admin
router.post('/customers', authenticate, authorize('admin', 'staff', 'cashier'), asyncHandler(async (req, res) => {
  const { phone, name } = req.body;
  res.json(await service.getOrCreateCustomer(req.user.restaurantId, phone, name));
}));

// Get single customer — admin
router.get('/customers/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.getCustomer(req.user.restaurantId, req.params.id));
}));

// Transaction history — admin
router.get('/customers/:id/transactions', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { limit, offset } = req.query;
  res.json(await service.getTransactionHistory(req.user.restaurantId, req.params.id, {
    limit: parseInt(limit) || 30, offset: parseInt(offset) || 0,
  }));
}));

// Manual points adjustment — admin
router.patch('/customers/:id/adjust', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { points, description } = req.body;
  res.json(await service.adjustPoints(req.user.restaurantId, req.params.id, points, description));
}));

// Update customer name — admin
router.patch('/customers/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.updateCustomerName(req.user.restaurantId, req.params.id, req.body.name));
}));

// Delete customer — admin
router.delete('/customers/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.deleteCustomer(req.user.restaurantId, req.params.id));
}));

module.exports = router;
