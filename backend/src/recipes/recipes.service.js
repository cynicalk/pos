const repo = require('./recipes.repository');
const db   = require('../shared/db');
const { NotFoundError, ValidationError } = require('../shared/errors');

function computeCost(ingredients) {
  return parseFloat(
    (ingredients || [])
      .reduce((sum, i) => sum + parseFloat(i.quantity) * parseFloat(i.cost_per_unit), 0)
      .toFixed(4),
  );
}

async function getAll(restaurantId) {
  const recipes = await repo.getAll(restaurantId);
  return recipes.map((r) => ({ ...r, current_cost: computeCost(r.ingredients) }));
}

async function getById(id, restaurantId) {
  const recipe = await repo.getById(id, restaurantId);
  if (!recipe) throw new NotFoundError('Recipe');
  return { ...recipe, current_cost: computeCost(recipe.ingredients) };
}

async function create(data, restaurantId) {
  if (!data.name) throw new ValidationError('name is required');
  const recipe = await repo.create({ ...data, restaurantId });
  return getById(recipe.id, restaurantId);
}

async function update(id, data, restaurantId) {
  const existing = await repo.getById(id, restaurantId);
  if (!existing) throw new NotFoundError('Recipe');
  return repo.update(id, data, restaurantId);
}

async function remove(id, restaurantId) {
  const { rows } = await db.query(
    'SELECT id FROM menu_items WHERE recipe_id = $1 LIMIT 1',
    [id],
  );
  if (rows.length > 0) throw new ValidationError('Recipe is linked to a menu item — unlink it first');
  const deleted = await repo.remove(id, restaurantId);
  if (!deleted) throw new NotFoundError('Recipe');
  return deleted;
}

async function getCost(id, restaurantId) {
  const recipe = await repo.getById(id, restaurantId);
  if (!recipe) throw new NotFoundError('Recipe');
  const totalCost = computeCost(recipe.ingredients);
  return { recipeId: id, totalCost, ingredients: recipe.ingredients };
}

async function takeSnapshot(id, restaurantId, triggeredBy) {
  const recipe = await repo.getById(id, restaurantId);
  if (!recipe) throw new NotFoundError('Recipe');
  const totalCost = computeCost(recipe.ingredients);

  const { rows } = await db.query(
    'SELECT price FROM menu_items WHERE recipe_id = $1 AND restaurant_id = $2 LIMIT 1',
    [id, restaurantId],
  );
  const sellingPrice = rows[0] ? parseFloat(rows[0].price) : 0;

  return repo.saveCostSnapshot({ recipeId: id, restaurantId, totalCost, sellingPrice, triggeredBy });
}

async function getSnapshots(id, restaurantId) {
  return repo.getSnapshots(id, restaurantId);
}

async function getCostReport(restaurantId) {
  const recipes = await repo.getAll(restaurantId);
  // Fetch linked menu item prices in one query
  const { rows: menuItems } = await db.query(
    'SELECT recipe_id, price, name FROM menu_items WHERE restaurant_id = $1 AND recipe_id IS NOT NULL',
    [restaurantId],
  );
  const priceMap = Object.fromEntries(menuItems.map((m) => [m.recipe_id, m]));

  return recipes.map((r) => {
    const totalCost    = computeCost(r.ingredients);
    const menuItem     = priceMap[r.id];
    const sellingPrice = menuItem ? parseFloat(menuItem.price) : null;
    const grossMargin  = sellingPrice !== null ? parseFloat((sellingPrice - totalCost).toFixed(4)) : null;
    const marginPct    = sellingPrice ? parseFloat(((grossMargin / sellingPrice) * 100).toFixed(2)) : null;
    return {
      ...r,
      current_cost:   totalCost,
      selling_price:  sellingPrice,
      menu_item_name: menuItem?.name ?? null,
      gross_margin:   grossMargin,
      margin_pct:     marginPct,
    };
  });
}

module.exports = { getAll, getById, create, update, remove, getCost, takeSnapshot, getSnapshots, getCostReport };
