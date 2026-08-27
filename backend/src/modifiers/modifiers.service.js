const repo = require('./modifiers.repository');
const { NotFoundError, ValidationError } = require('../shared/errors');

async function getGroups(restaurantId) {
  return repo.getGroups(restaurantId);
}

async function createGroup(data, restaurantId) {
  if (!data.name) throw new ValidationError('name is required');
  return repo.createGroup({ ...data, restaurantId });
}

async function updateGroup(id, data, restaurantId) {
  const updated = await repo.updateGroup(id, data, restaurantId);
  if (!updated) throw new NotFoundError('Modifier group');
  return updated;
}

async function deleteGroup(id, restaurantId) {
  const deleted = await repo.deleteGroup(id, restaurantId);
  if (!deleted) throw new NotFoundError('Modifier group');
  return deleted;
}

async function addOption(groupId, data, restaurantId) {
  if (!data.label) throw new ValidationError('label is required');
  const option = await repo.createOption({ ...data, groupId }, restaurantId);
  if (!option) throw new NotFoundError('Modifier group');
  return option;
}

async function deleteOption(id, restaurantId) {
  const deleted = await repo.deleteOption(id, restaurantId);
  if (!deleted) throw new NotFoundError('Modifier option');
  return deleted;
}

async function getOverrides(recipeId, restaurantId) {
  return repo.getOverrides(recipeId, restaurantId);
}

async function upsertOverride(data, restaurantId) {
  if (!data.recipeId || !data.optionId || !data.ingredientId) {
    throw new ValidationError('recipeId, optionId, and ingredientId are required');
  }
  const saved = await repo.upsertOverride(data, restaurantId);
  if (!saved) throw new NotFoundError('Recipe, option, or ingredient');
  return saved;
}

async function deleteOverride(recipeId, optionId, ingredientId, restaurantId) {
  return repo.deleteOverride(recipeId, optionId, ingredientId, restaurantId);
}

module.exports = {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  addOption,
  deleteOption,
  getOverrides,
  upsertOverride,
  deleteOverride,
};
