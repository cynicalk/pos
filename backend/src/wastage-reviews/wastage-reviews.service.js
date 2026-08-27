const crypto         = require('crypto');
const repo           = require('./wastage-reviews.repository');
const menuRepo       = require('../menu/menu.repository');
const recipesRepo    = require('../recipes/recipes.repository');
const ingredientsRepo = require('../ingredients/ingredients.repository');
const wasteRepo      = require('../waste/waste.repository');
const invRepo        = require('../inventory/inventory.repository');
const { NotFoundError, ValidationError } = require('../shared/errors');

// Called when an order item is cancelled as wastage.
// Snapshots the recipe ingredients so the admin can decide what was actually wasted
// vs. what can be recovered, without touching stock yet.
async function createReview({ restaurantId, orderId, orderItemId, menuItemId, menuItemName, quantity, cancelReason }) {
  const portionsNum = parseFloat(quantity) || 1;
  const ingredients = [];

  const menuItem = await menuRepo.getById(menuItemId, restaurantId);
  if (menuItem?.recipe_id) {
    const recipe = await recipesRepo.getById(menuItem.recipe_id, restaurantId);
    if (recipe?.ingredients?.length) {
      const yieldQty = parseFloat(recipe.yield_quantity) || 1;
      for (const ing of recipe.ingredients) {
        const ingredient = await ingredientsRepo.getById(ing.ingredient_id, restaurantId);
        if (!ingredient) continue;
        const defaultQty = parseFloat((parseFloat(ing.quantity) * portionsNum / yieldQty).toFixed(6));
        ingredients.push({
          ingredient_id:   ing.ingredient_id,
          ingredient_name: ingredient.name,
          unit:            ing.unit || ingredient.unit,
          unit_cost:       parseFloat(ingredient.latest_unit_cost) || 0,
          default_qty:     defaultQty,
          wasted_qty:      defaultQty,
          returned_qty:    0,
        });
      }
    }
  }

  return repo.create({
    restaurantId, orderId, orderItemId,
    menuItemId, menuItemName: menuItemName || menuItem?.name || '',
    quantity: portionsNum, cancelReason, ingredients,
  });
}

// Admin resolves a pending review: commits waste_log entries and returns
// any recovered quantities to stock.
async function resolveReview(id, { restaurantId, reviewedBy, ingredients }) {
  const review = await repo.getById(id, restaurantId);
  if (!review)                      throw new NotFoundError('Wastage review');
  if (review.status === 'reviewed') throw new ValidationError('This review has already been resolved');

  for (const ing of ingredients) {
    const wasted   = parseFloat(ing.wasted_qty   ?? 0);
    const returned = parseFloat(ing.returned_qty ?? 0);
    if (wasted < 0 || returned < 0)
      throw new ValidationError(`${ing.ingredient_name}: quantities cannot be negative`);
    if (wasted + returned > parseFloat(ing.default_qty) + 0.001)
      throw new ValidationError(`${ing.ingredient_name}: wasted + returned exceeds the original quantity`);
  }

  const batchId = crypto.randomUUID();

  for (const ing of ingredients) {
    const wasted   = parseFloat(ing.wasted_qty   ?? 0);
    const returned = parseFloat(ing.returned_qty ?? 0);

    if (wasted > 0) {
      await wasteRepo.create({
        restaurantId,
        ingredientId:  ing.ingredient_id,
        quantity:      wasted,
        unit:          ing.unit,
        reason:        'VOID_WASTE',
        costAtTime:    ing.unit_cost,
        totalCost:     parseFloat((wasted * ing.unit_cost).toFixed(4)),
        loggedBy:      reviewedBy || null,
        notes:         review.cancel_reason || `Order wastage — ${review.menu_item_name}`,
        menuItemId:    review.menu_item_id,
        menuItemName:  review.menu_item_name,
        batchId,
      });
    }

    if (returned > 0) {
      await ingredientsRepo.adjustStock(ing.ingredient_id, returned, restaurantId);
      await invRepo.createTransaction({
        restaurantId,
        ingredientId:  ing.ingredient_id,
        txnType:       'RETURN',
        quantityDelta: returned,
        refId:         id,
        unitCost:      ing.unit_cost,
        performedBy:   reviewedBy || null,
      });
    }
  }

  return repo.resolve(id, { reviewedBy, ingredients });
}

async function listReviews(restaurantId, { status } = {}) {
  return repo.getAll(restaurantId, { status });
}

module.exports = { createReview, resolveReview, listReviews };
