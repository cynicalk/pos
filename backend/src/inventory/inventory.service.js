const repo           = require('./inventory.repository');
const ingredientsRepo = require('../ingredients/ingredients.repository');
const db             = require('../shared/db');
const { NotFoundError, ValidationError } = require('../shared/errors');
const { validateTimezone } = require('../shared/timezone');

async function getTransactions(restaurantId, filters = {}) {
  return repo.getTransactions(restaurantId, { ...filters, tz: validateTimezone(filters.tz, 'UTC') });
}

// Atomically move ingredient stock AND write the matching ledger row on one
// transaction client, so stock_on_hand and inventory_transactions can never
// diverge (closes the old two-separate-writes gap). Returns the ledger row.
async function postStockMovement(client, { restaurantId, ingredientId, quantityDelta, txnType, refId, unitCost, performedBy }) {
  await ingredientsRepo.adjustStock(ingredientId, quantityDelta, restaurantId, client);
  return repo.createTransaction({
    restaurantId, ingredientId, txnType, quantityDelta,
    refId:       refId || null,
    unitCost,
    performedBy: performedBy || null,
  }, client);
}

async function recordAdjustment({ restaurantId, ingredientId, quantityDelta, notes, performedBy }) {
  const ingredient = await ingredientsRepo.getById(ingredientId, restaurantId);
  if (!ingredient) throw new NotFoundError('Ingredient');
  const delta = parseFloat(quantityDelta);
  if (!delta || delta === 0) throw new ValidationError('quantityDelta cannot be zero');

  return db.withTransaction((client) =>
    postStockMovement(client, {
      restaurantId,
      ingredientId,
      txnType:       'ADJUSTMENT',
      quantityDelta: delta,
      refId:         notes || null,
      unitCost:      parseFloat(ingredient.latest_unit_cost),
      performedBy:   performedBy || null,
    }),
  );
}

async function getWasteReport(restaurantId, filters = {}) {
  return repo.getWasteReport(restaurantId, { ...filters, tz: validateTimezone(filters.tz, 'UTC') });
}

// Expands each order line into its recipe ingredients and posts a stock movement
// per ingredient, all on the caller's transaction `client`. Reads run on the
// same client so they see consistent state. `direction` is -1 (deduct/SALE) or
// +1 (return/RETURN).
async function _applyRecipeStock(client, orderId, restaurantId, items, direction) {
  const txnType = direction > 0 ? 'RETURN' : 'SALE';
  for (const item of items) {
    if (!item.menu_item_id) continue;
    const { rows: [menuItem] } = await client.query(
      'SELECT recipe_id FROM menu_items WHERE id = $1', [item.menu_item_id],
    );
    if (!menuItem?.recipe_id) continue;
    const { rows: recipeIngredients } = await client.query(
      `SELECT ri.ingredient_id, ri.quantity, i.latest_unit_cost
       FROM recipe_ingredients ri
       JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE ri.recipe_id = $1`,
      [menuItem.recipe_id],
    );
    for (const ri of recipeIngredients) {
      const totalQty = parseFloat(ri.quantity) * parseInt(item.quantity, 10);
      await postStockMovement(client, {
        restaurantId,
        ingredientId:  ri.ingredient_id,
        quantityDelta: direction * totalQty,
        txnType,
        refId:         orderId,
        unitCost:      parseFloat(ri.latest_unit_cost),
        performedBy:   null,
      });
    }
  }
}

// Deduct ingredients for an order, on the caller's transaction client, so the
// stock movements commit (or roll back) atomically with the order itself.
// Errors propagate on purpose — a failed deduction must fail the order.
function deductForOrderTx(client, orderId, restaurantId, orderItems) {
  return _applyRecipeStock(client, orderId, restaurantId, orderItems, -1);
}

// Return ingredients to stock when items are cancelled/voided. Runs in its own
// transaction so stock + ledger stay consistent with each other; callers invoke
// it best-effort (.catch) so a return failure never breaks the void state machine.
function returnStock(orderId, restaurantId, items) {
  return db.withTransaction((client) => _applyRecipeStock(client, orderId, restaurantId, items, +1));
}

const IMPORT_VALID_TYPES = new Set(['PURCHASE', 'ADJUSTMENT', 'WASTE', 'RETURN']);

async function importTransactions({ restaurantId, performedBy, rows }) {
  if (!Array.isArray(rows) || rows.length === 0)
    throw new ValidationError('rows must be a non-empty array');

  const allIngredients = await ingredientsRepo.getAll(restaurantId);
  const nameMap = {};
  for (const ing of allIngredients) {
    nameMap[ing.name.toLowerCase().trim()] = ing;
  }

  const created = [];
  const errors  = [];

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i];
    const rowNum = i + 2; // +2 = 1-indexed + header row

    const ing = nameMap[(row.ingredient_name || '').toLowerCase().trim()];
    if (!ing) {
      errors.push({ row: rowNum, error: `Unknown ingredient: "${row.ingredient_name}"` });
      continue;
    }

    const txnType = (row.type || '').toUpperCase().trim();
    if (!IMPORT_VALID_TYPES.has(txnType)) {
      errors.push({ row: rowNum, error: `Invalid type "${row.type}" — use PURCHASE, ADJUSTMENT, WASTE, or RETURN` });
      continue;
    }

    const delta = parseFloat(row.quantity_delta);
    if (isNaN(delta) || delta === 0) {
      errors.push({ row: rowNum, error: `Invalid quantity_delta "${row.quantity_delta}"` });
      continue;
    }

    const rawCost = row.unit_cost !== undefined && row.unit_cost !== ''
      ? parseFloat(row.unit_cost)
      : parseFloat(ing.latest_unit_cost);
    const unitCost = isNaN(rawCost) ? 0 : rawCost;

    // Each row's stock update + ledger row commit together; rows are independent
    // so a later bad row doesn't roll back earlier valid ones (partial success).
    const txn = await db.withTransaction((client) =>
      postStockMovement(client, {
        restaurantId,
        ingredientId:  ing.id,
        txnType,
        quantityDelta: delta,
        refId:         row.ref_id || 'IMPORT',
        unitCost,
        performedBy,
      }),
    );
    created.push(txn.id);
  }

  return { created: created.length, errors };
}

module.exports = { getTransactions, recordAdjustment, getWasteReport, postStockMovement, deductForOrderTx, returnStock, importTransactions };
