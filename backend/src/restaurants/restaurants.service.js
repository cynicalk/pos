const repo = require('./restaurants.repository');
const { NotFoundError, ValidationError } = require('../shared/errors');

async function getCurrent(restaurantId) {
  const restaurant = await repo.findById(restaurantId);
  if (!restaurant) throw new NotFoundError('Restaurant');
  return restaurant;
}

async function getAll() {
  return repo.findAll();
}

async function create(name) {
  if (!name || !name.trim()) throw new ValidationError('name is required');
  return repo.create(name.trim());
}

module.exports = { getCurrent, getAll, create };
