const repo = require('./combos.repository');
const { NotFoundError, ValidationError } = require('../shared/errors');

async function getAll(restaurantId) {
  return repo.getAll(restaurantId);
}

async function create(data, restaurantId) {
  if (!data.name)  throw new ValidationError('name is required');
  if (!data.price) throw new ValidationError('price is required');
  return repo.create({ ...data, restaurantId });
}

async function update(id, data, restaurantId) {
  const existing = await repo.getById(id, restaurantId);
  if (!existing) throw new NotFoundError('Combo');
  return repo.update(id, data, restaurantId);
}

module.exports = { getAll, create, update };
