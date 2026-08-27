const crypto         = require('crypto');
const repo           = require('./waste.repository');
const ingredientsRepo = require('../ingredients/ingredients.repository');
const menuRepo       = require('../menu/menu.repository');
const recipesRepo    = require('../recipes/recipes.repository');
const invRepo        = require('../inventory/inventory.repository');
const { NotFoundError, ValidationError } = require('../shared/errors');
const { validateTimezone } = require('../shared/timezone');

const VALID_REASONS = ['SPOILAGE', 'SPILL', 'OVERPREP', 'DAMAGED', 'OTHER'];

async function getAll(restaurantId, { from, to, tz } = {}) {
  return repo.getAll(restaurantId, { from, to, tz: validateTimezone(tz, 'UTC') });
}

async function logWaste({ restaurantId, ingredientId, quantity, unit, reason, notes, loggedBy }) {
  if (!ingredientId) throw new ValidationError('ingredientId is required');
  const qty = parseFloat(quantity);
  if (!qty || qty <= 0) throw new ValidationError('quantity must be positive');
  if (!VALID_REASONS.includes(reason)) {
    throw new ValidationError(`reason must be one of: ${VALID_REASONS.join(', ')}`);
  }

  const ingredient = await ingredientsRepo.getById(ingredientId, restaurantId);
  if (!ingredient) throw new NotFoundError('Ingredient');

  const costAtTime = parseFloat(ingredient.latest_unit_cost);
  const totalCost  = parseFloat((qty * costAtTime).toFixed(4));
  const wasteUnit  = unit || ingredient.unit;

  const waste = await repo.create({
    restaurantId, ingredientId, quantity: qty, unit: wasteUnit,
    reason, costAtTime, totalCost, loggedBy, notes,
  });

  await ingredientsRepo.adjustStock(ingredientId, -qty, restaurantId);

  await invRepo.createTransaction({
    restaurantId,
    ingredientId,
    txnType:       'WASTE',
    quantityDelta: -qty,
    refId:         waste.id,
    unitCost:      costAtTime,
    performedBy:   loggedBy || null,
  });

  return waste;
}

async function logWasteByMenuItem({ restaurantId, menuItemId, portions, reason, notes, loggedBy }) {
  const portionsNum = parseFloat(portions);
  if (!menuItemId)                       throw new ValidationError('menuItemId is required');
  if (!portionsNum || portionsNum <= 0)  throw new ValidationError('portions must be a positive number');
  if (!VALID_REASONS.includes(reason))   throw new ValidationError(`reason must be one of: ${VALID_REASONS.join(', ')}`);

  const menuItem = await menuRepo.getById(menuItemId, restaurantId);
  if (!menuItem)          throw new NotFoundError('Menu item');
  if (!menuItem.recipe_id) throw new ValidationError('This menu item has no recipe linked — link a recipe first');

  const recipe = await recipesRepo.getById(menuItem.recipe_id, restaurantId);
  if (!recipe || !recipe.ingredients?.length) throw new ValidationError('Recipe has no ingredients');

  const batchId = crypto.randomUUID();
  const yieldQty = parseFloat(recipe.yield_quantity) || 1;
  const results  = [];

  for (const ing of recipe.ingredients) {
    const ingredient = await ingredientsRepo.getById(ing.ingredient_id, restaurantId);
    if (!ingredient) continue;

    const qty        = parseFloat((parseFloat(ing.quantity) * portionsNum / yieldQty).toFixed(6));
    const costAtTime = parseFloat(ingredient.latest_unit_cost) || 0;
    const totalCost  = parseFloat((qty * costAtTime).toFixed(4));

    const waste = await repo.create({
      restaurantId, ingredientId: ing.ingredient_id,
      quantity: qty, unit: ing.unit || ingredient.unit,
      reason, costAtTime, totalCost, loggedBy, notes,
      menuItemId, menuItemName: menuItem.name, batchId,
    });

    await ingredientsRepo.adjustStock(ing.ingredient_id, -qty, restaurantId);
    await invRepo.createTransaction({
      restaurantId, ingredientId: ing.ingredient_id,
      txnType: 'WASTE', quantityDelta: -qty,
      refId: waste.id, unitCost: costAtTime, performedBy: loggedBy || null,
    });

    results.push(waste);
  }

  return results;
}

// Called when an order item is cancelled as wastage.
// Creates a pending wastage_review for admin to inspect — stock is NOT touched here
// (the SALE at order creation already deducted it; the admin decides what to return).
async function logWasteFromOrder({ restaurantId, menuItemId, quantity, orderId, orderItemId, cancelReason }) {
  if (!menuItemId || !quantity) return null;
  const reviewsService = require('../wastage-reviews/wastage-reviews.service');
  return reviewsService.createReview({
    restaurantId, orderId, orderItemId,
    menuItemId, quantity, cancelReason,
  });
}

module.exports = { getAll, logWaste, logWasteByMenuItem, logWasteFromOrder };
