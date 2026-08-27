const repo = require('./stocktake.repository');
const ingredientsRepo = require('../ingredients/ingredients.repository');
const inventoryRepo = require('../inventory/inventory.repository');
const { NotFoundError, ValidationError } = require('../shared/errors');

async function createCount({ restaurantId, label, notes, createdBy }) {
  if (!label || !String(label).trim()) throw new ValidationError('label is required');
  return repo.createCount({ restaurantId, label: String(label).trim().slice(0, 120), notes, createdBy });
}

async function listCounts(restaurantId) {
  return repo.listCounts(restaurantId);
}

async function getCount(id, restaurantId) {
  const header = await repo.getCountHeader(id, restaurantId);
  if (!header) throw new NotFoundError('Stock count');
  const lines = await repo.getCountLines(id);
  return { ...header, lines };
}

async function saveLines(id, restaurantId, lines) {
  const header = await repo.getCountHeader(id, restaurantId);
  if (!header) throw new NotFoundError('Stock count');
  if (header.status !== 'open') throw new ValidationError('Cannot edit a finalized count');
  if (!Array.isArray(lines)) throw new ValidationError('lines must be an array');

  const clean = [];
  for (const l of lines) {
    if (!l || !l.ingredientId) continue;
    const qty = l.countedQty === null || l.countedQty === '' ? null : Number(l.countedQty);
    if (qty !== null && (!Number.isFinite(qty) || qty < 0)) {
      throw new ValidationError('counted quantities must be non-negative numbers');
    }
    clean.push({ ingredientId: l.ingredientId, countedQty: qty });
  }
  await repo.saveLines(id, restaurantId, clean);
  return getCount(id, restaurantId);
}

// Finalize the count. When `reconcile` is true, post ADJUSTMENT transactions so
// each ingredient's stock_on_hand is corrected to the physically counted figure
// (off by default — finalizing shouldn't silently move stock).
async function finalize(id, restaurantId, { reconcile = false, performedBy } = {}) {
  const header = await repo.getCountHeader(id, restaurantId);
  if (!header) throw new NotFoundError('Stock count');
  if (header.status !== 'open') throw new ValidationError('Count is already finalized');

  const count = await repo.finalizeCount(id, restaurantId);

  if (reconcile) {
    const lines = await repo.getCountLines(id);
    for (const l of lines) {
      if (l.counted_qty == null) continue;
      const delta = Number(l.counted_qty) - Number(l.system_qty ?? 0);
      if (Math.abs(delta) < 1e-9) continue;
      await ingredientsRepo.adjustStock(l.ingredient_id, delta, restaurantId);
      await inventoryRepo.createTransaction({
        restaurantId, ingredientId: l.ingredient_id, txnType: 'ADJUSTMENT',
        quantityDelta: delta, refId: `stocktake:${id}`,
        unitCost: l.latest_unit_cost, performedBy,
      });
    }
  }
  return count;
}

// CSV/spreadsheet import: rows are [{ ingredient_name, counted_qty }], matched to
// ingredients by name (case-insensitive). Mirrors inventory.importTransactions.
async function importCounts(id, restaurantId, rows) {
  const header = await repo.getCountHeader(id, restaurantId);
  if (!header) throw new NotFoundError('Stock count');
  if (header.status !== 'open') throw new ValidationError('Cannot import into a finalized count');
  if (!Array.isArray(rows) || rows.length === 0) throw new ValidationError('rows must be a non-empty array');

  const ingredients = await ingredientsRepo.getAll(restaurantId);
  const byName = new Map(ingredients.map((i) => [i.name.toLowerCase().trim(), i]));

  const lines = [];
  const errors = [];
  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-indexed + header row
    const ing = byName.get(String(row.ingredient_name || '').toLowerCase().trim());
    if (!ing) { errors.push({ row: rowNum, error: `Unknown ingredient: "${row.ingredient_name}"` }); return; }
    const qty = Number(row.counted_qty);
    if (!Number.isFinite(qty) || qty < 0) { errors.push({ row: rowNum, error: `Invalid counted_qty "${row.counted_qty}"` }); return; }
    lines.push({ ingredientId: ing.id, countedQty: qty });
  });

  if (lines.length) await repo.saveLines(id, restaurantId, lines);
  return { updated: lines.length, errors };
}

async function deleteCount(id, restaurantId) {
  const deleted = await repo.deleteCount(id, restaurantId);
  if (!deleted) throw new ValidationError('Only an open count can be deleted');
  return { ok: true };
}

module.exports = { createCount, listCounts, getCount, saveLines, finalize, importCounts, deleteCount };
