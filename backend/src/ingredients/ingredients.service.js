const repo = require('./ingredients.repository');
const invRepo = require('../inventory/inventory.repository');
const { NotFoundError, ValidationError } = require('../shared/errors');

async function getAll(restaurantId) {
  return repo.getAll(restaurantId);
}

async function getLowStock(restaurantId) {
  return repo.getLowStock(restaurantId);
}

async function create(data, restaurantId) {
  if (!data.name) throw new ValidationError('name is required');
  if (!data.unit) throw new ValidationError('unit is required');
  return repo.create({ ...data, restaurantId });
}

async function update(id, data, restaurantId) {
  const existing = await repo.getById(id, restaurantId);
  if (!existing) throw new NotFoundError('Ingredient');
  return repo.update(id, data, restaurantId);
}

async function recordPurchase(id, { quantity, unitCost, performedBy }, restaurantId) {
  const ingredient = await repo.getById(id, restaurantId);
  if (!ingredient) throw new NotFoundError('Ingredient');

  const qty = parseFloat(quantity);
  if (!qty || qty <= 0) throw new ValidationError('quantity must be positive');

  const cost = parseFloat(unitCost ?? ingredient.latest_unit_cost);

  await repo.adjustStock(id, qty, restaurantId);
  if (unitCost !== undefined) {
    await repo.update(id, { latestUnitCost: cost }, restaurantId);
  }

  await invRepo.createTransaction({
    restaurantId,
    ingredientId: id,
    txnType: 'PURCHASE',
    quantityDelta: qty,
    unitCost: cost,
    performedBy: performedBy || null,
  });

  return repo.getById(id, restaurantId);
}

module.exports = { getAll, getLowStock, create, update, recordPurchase };
