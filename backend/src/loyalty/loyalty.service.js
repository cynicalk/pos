const repo = require('./loyalty.repository');
const { NotFoundError, ValidationError } = require('../shared/errors');

async function lookupCustomer(restaurantId, phone) {
  return repo.findByPhone(restaurantId, phone);
}

async function getOrCreateCustomer(restaurantId, phone, name) {
  if (!phone) throw new ValidationError('phone is required');
  return repo.findOrCreate(restaurantId, phone.trim(), name);
}

async function listCustomers(restaurantId, query = {}) {
  return repo.list(restaurantId, query);
}

async function getCustomer(restaurantId, customerId) {
  const c = await repo.findById(restaurantId, customerId);
  if (!c) throw new NotFoundError('Customer');
  return c;
}

async function getTransactionHistory(restaurantId, customerId, query = {}) {
  const customer = await getCustomer(restaurantId, customerId);
  const transactions = await repo.getTransactions(restaurantId, customerId, query);
  return { customer, transactions };
}

async function adjustPoints(restaurantId, customerId, points, description) {
  const n = parseInt(points);
  if (isNaN(n) || n === 0) throw new ValidationError('points must be a non-zero integer');
  const customer = await getCustomer(restaurantId, customerId);
  if (customer.points_balance + n < 0) {
    throw new ValidationError(`Cannot deduct ${Math.abs(n)} pts — customer only has ${customer.points_balance}`);
  }
  return repo.addTransaction(restaurantId, {
    customerId,
    orderId: null,
    type: 'adjust',
    points: n,
    description: description || (n > 0 ? 'Manual adjustment (add)' : 'Manual adjustment (deduct)'),
  });
}

// Settled inside the payment transaction — pass the payment's `client` so points
// commit (or roll back) atomically with the payment.
async function earnPoints(restaurantId, customerId, orderId, earnableAmount, settings, client) {
  const rate = parseFloat(settings.loyalty_points_per_unit || '0');
  if (rate <= 0) return;
  const points = Math.floor(earnableAmount * rate);
  if (points <= 0) return;
  await repo.addTransaction(restaurantId, {
    customerId, orderId, type: 'earn',
    points,
    description: `Earned from order`,
  }, client);
}

// Deduct redeemed points; settled inside the payment transaction. A redeem that
// would drive the balance negative trips the points_balance >= 0 CHECK and rolls
// the payment back (no oversell).
async function deductPoints(restaurantId, customerId, orderId, pointsRedeemed, client) {
  if (pointsRedeemed <= 0) return;
  await repo.addTransaction(restaurantId, {
    customerId, orderId, type: 'redeem',
    points: -pointsRedeemed,
    description: 'Redeemed on order',
  }, client);
}

// Called when cashier tries to apply redemption — validates without committing
function validateRedemption(customer, pointsToRedeem, orderSubtotal, settings) {
  const n = parseInt(pointsToRedeem);
  if (isNaN(n) || n <= 0) throw new ValidationError('pointsToRedeem must be a positive integer');
  if (n > customer.points_balance) {
    throw new ValidationError(`Customer only has ${customer.points_balance} points`);
  }
  const pointsValue = parseFloat(settings.loyalty_points_value || '0');
  if (pointsValue <= 0) throw new ValidationError('Loyalty redemption rate is not configured. Set it in Loyalty → Programme Settings.');
  const redemptionValue = parseFloat((n * pointsValue).toFixed(2));
  if (redemptionValue > orderSubtotal) {
    throw new ValidationError('Redemption value exceeds order total');
  }
  return { redemptionValue };
}

async function deleteCustomer(restaurantId, customerId) {
  const deleted = await repo.remove(restaurantId, customerId);
  if (!deleted) throw new NotFoundError('Customer');
  return deleted;
}

async function updateCustomerName(restaurantId, customerId, name) {
  if (!name || !name.trim()) throw new ValidationError('name is required');
  const updated = await repo.updateName(restaurantId, customerId, name.trim());
  if (!updated) throw new NotFoundError('Customer');
  return updated;
}

async function listTiers(restaurantId) {
  return repo.listTiers(restaurantId);
}

async function saveTiers(restaurantId, tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) throw new ValidationError('tiers must be a non-empty array');
  const first = [...tiers].sort((a, b) => (a.min_points ?? 0) - (b.min_points ?? 0))[0];
  if ((first.min_points ?? 0) !== 0) throw new ValidationError('The first tier must start at 0 points');
  return repo.replaceTiers(restaurantId, tiers);
}

async function listRewards(restaurantId) {
  return repo.listRewards(restaurantId);
}

async function saveRewards(restaurantId, rewards) {
  if (!Array.isArray(rewards)) throw new ValidationError('rewards must be an array');
  return repo.replaceRewards(restaurantId, rewards);
}

module.exports = {
  lookupCustomer, getOrCreateCustomer, listCustomers, getCustomer,
  getTransactionHistory, adjustPoints,
  earnPoints, deductPoints, validateRedemption,
  deleteCustomer, updateCustomerName,
  listTiers, saveTiers, listRewards, saveRewards,
};
