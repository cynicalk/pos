const db = require('../shared/db');
const repo = require('./procurement.repository');
const ingredientsRepo = require('../ingredients/ingredients.repository');
const inventoryService = require('../inventory/inventory.service');
const inventory = require('../modules/kitchen/inventory');
const purchasing = require('../modules/procurement/purchasing');
const { ValidationError, NotFoundError } = require('../shared/errors');

const CONSUMPTION_DAYS = purchasing.CONSUMPTION_DAYS;

// ── Suppliers ──────────────────────────────────────────────────────────────

const listSuppliers = (restaurantId) => repo.listSuppliers(restaurantId);

async function createSupplier(restaurantId, data) {
  if (!data.name || !String(data.name).trim()) {
    throw new ValidationError('Supplier name is required');
  }
  if (data.leadTimeDays != null && (!Number.isInteger(Number(data.leadTimeDays)) || Number(data.leadTimeDays) < 0)) {
    throw new ValidationError('leadTimeDays must be a whole number of days, zero or more');
  }
  return repo.createSupplier(restaurantId, { ...data, name: String(data.name).trim() });
}

async function updateSupplier(id, restaurantId, data) {
  const updated = await repo.updateSupplier(id, restaurantId, data);
  if (!updated) throw new NotFoundError('Supplier');
  return updated;
}

async function assignIngredient(ingredientId, restaurantId, supplierId) {
  const updated = await repo.assignIngredient(ingredientId, restaurantId, supplierId);
  if (!updated) throw new NotFoundError('Ingredient');
  return updated;
}

// ── Reorder positions ──────────────────────────────────────────────────────

/**
 * Every ingredient with its computed reorder point.
 *
 * This does NOT replace `ingredients.reorder_level`, which an operator sets by
 * hand. Both are shown: the manual level is what the low-stock list already
 * uses, and the computed point is what the observed usage and the supplier's
 * lead time actually imply. Where they disagree, that disagreement is the
 * useful information.
 */
async function getReorderPositions(restaurantId) {
  const rows = await repo.getReorderInputs(restaurantId, CONSUMPTION_DAYS);
  return {
    consumptionDays: CONSUMPTION_DAYS,
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      unit: row.unit,
      supplierName: row.supplier_name,
      manualReorderLevel: Number(row.reorder_level || 0),
      latestUnitCost: Number(row.latest_unit_cost || 0),
      ...inventory.buildReorderPosition({
        onHand: Number(row.stock_on_hand || 0),
        dailyUsage: Number(row.daily_usage || 0),
        leadTimeDays: Number(row.lead_time_days ?? inventory.DEFAULT_LEAD_TIME_DAYS),
      }),
    })),
  };
}

/** Draft purchase orders, one per supplier, sized to actual need. */
async function getPoSuggestions(restaurantId) {
  const rows = await repo.getReorderInputs(restaurantId, CONSUMPTION_DAYS);
  const withPoints = rows.map((row) => ({
    ...row,
    reorder_point: inventory.reorderPoint(
      Number(row.daily_usage || 0),
      Number(row.lead_time_days ?? inventory.DEFAULT_LEAD_TIME_DAYS),
    ),
  }));
  return purchasing.buildPoSuggestions(withPoints);
}

// ── Purchase orders ────────────────────────────────────────────────────────

const listPurchaseOrders = (restaurantId, status) => repo.listPurchaseOrders(restaurantId, status);

async function createPurchaseOrder(restaurantId, { supplierId, lines, notes }, userId) {
  if (!supplierId) throw new ValidationError('supplierId is required');
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ValidationError('A purchase order needs at least one line');
  }

  const clean = lines.map((l) => {
    const quantity = Number(l.quantity);
    const unitCost = Number(l.unitCost ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ValidationError(`Line "${l.name || l.ingredientId}" needs a quantity above zero`);
    }
    return {
      ingredientId: l.ingredientId,
      name: l.name,
      unit: l.unit,
      quantity,
      unitCost,
      lineTotal: Math.round(quantity * unitCost * 100) / 100,
    };
  });

  const total = Math.round(clean.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  return repo.createPurchaseOrder(restaurantId, {
    supplierId, lines: clean, total, notes, createdBy: userId,
  });
}

/**
 * Mark a purchase order received and book every line into stock.
 *
 * The whole thing runs in one transaction: a receipt that updated stock but
 * failed to mark the PO — or the reverse — would leave the ledger and the
 * order disagreeing, and the ledger is what the reorder arithmetic reads.
 *
 * Each line posts a PURCHASE movement through the existing inventory service,
 * so a delivery is recorded exactly like any other stock movement rather than
 * through a second, parallel path.
 *
 * The line's unit cost also updates the ingredient's cost, which the migration
 * 076 trigger appends to the price history — labelled 'purchase' via the
 * transaction-local setting, so an invoice-driven change and a delivery-driven
 * one stay distinguishable in the trail.
 */
async function receivePurchaseOrder(id, restaurantId, userId) {
  const po = await repo.getPurchaseOrder(id, restaurantId);
  if (!po) throw new NotFoundError('Purchase order');
  if (po.status === 'received') throw new ValidationError('This order is already received');
  if (po.status === 'cancelled') throw new ValidationError('This order was cancelled');

  return db.withTransaction(async (client) => {
    await client.query(`SET LOCAL cooklyt.price_source = 'purchase'`);

    for (const line of po.lines || []) {
      if (!line.ingredientId || !(Number(line.quantity) > 0)) continue;

      await inventoryService.postStockMovement(client, {
        restaurantId,
        ingredientId: line.ingredientId,
        txnType: 'PURCHASE',
        quantityDelta: Number(line.quantity),
        refId: `PO ${id.slice(0, 8)}`,
        unitCost: Number(line.unitCost || 0),
        performedBy: userId || null,
      });

      // Only move the cost when the line actually carried one. A zero-cost
      // line means "price unknown", not "free", and writing it would poison
      // every margin figure that reads latest_unit_cost.
      if (Number(line.unitCost) > 0) {
        await client.query(
          `UPDATE ingredients SET latest_unit_cost = $1 WHERE id = $2 AND restaurant_id = $3`,
          [Number(line.unitCost), line.ingredientId, restaurantId],
        );
      }
    }

    const { rows } = await client.query(
      `UPDATE purchase_orders
       SET status = 'received', received_at = now(), updated_at = now()
       WHERE id = $1 AND restaurant_id = $2 RETURNING *`,
      [id, restaurantId],
    );
    return rows[0];
  });
}

async function setPurchaseOrderStatus(id, restaurantId, status) {
  if (!['draft', 'sent', 'cancelled'].includes(status)) {
    throw new ValidationError('status must be draft, sent or cancelled — use receive to book a delivery');
  }
  const po = await repo.getPurchaseOrder(id, restaurantId);
  if (!po) throw new NotFoundError('Purchase order');
  if (po.status === 'received') {
    throw new ValidationError('A received order cannot be moved back — its stock is already booked');
  }
  return repo.setPurchaseOrderStatus(id, restaurantId, status);
}

// ── Invoice intake ─────────────────────────────────────────────────────────

/**
 * Apply a supplier invoice CSV to ingredient prices.
 *
 * Unmatched names are reported, never created: inventing an ingredient from a
 * supplier's spelling would fork the item ("Tomatoes" vs "Tomato") and quietly
 * split its cost history in two.
 */
async function importInvoice(restaurantId, csvText) {
  const { rows, errors } = purchasing.parseInvoiceCsv(csvText);
  if (rows.length === 0) {
    return { updated: [], unmatched: [], errors: errors.length ? errors : ['Nothing to import.'] };
  }

  const matches = await repo.findIngredientsByName(restaurantId, rows.map((r) => r.name));
  const byName = new Map(matches.map((m) => [m.name.toLowerCase(), m]));

  const updated = [];
  const unmatched = [];

  await db.withTransaction(async (client) => {
    await client.query(`SET LOCAL cooklyt.price_source = 'invoice'`);

    for (const row of rows) {
      const ingredient = byName.get(row.name.toLowerCase());
      if (!ingredient) { unmatched.push(row.name); continue; }

      const previous = Number(ingredient.latest_unit_cost || 0);
      if (Number(row.unitCost) === previous) continue; // nothing changed

      await client.query(
        `UPDATE ingredients SET latest_unit_cost = $1 WHERE id = $2 AND restaurant_id = $3`,
        [row.unitCost, ingredient.id, restaurantId],
      );
      updated.push({
        id: ingredient.id,
        name: ingredient.name,
        previousCost: previous,
        newCost: row.unitCost,
        changePct: purchasing.priceChangePct(previous, row.unitCost),
      });
    }
  });

  return { updated, unmatched, errors };
}

const getPriceHistory = async (ingredientId, restaurantId) => {
  const ingredient = await ingredientsRepo.getById(ingredientId, restaurantId);
  if (!ingredient) throw new NotFoundError('Ingredient');
  return {
    ingredient: { id: ingredient.id, name: ingredient.name, unit: ingredient.unit },
    history: await repo.getPriceHistory(ingredientId, restaurantId),
  };
};

module.exports = {
  CONSUMPTION_DAYS,
  listSuppliers, createSupplier, updateSupplier, assignIngredient,
  getReorderPositions, getPoSuggestions,
  listPurchaseOrders, createPurchaseOrder, receivePurchaseOrder, setPurchaseOrderStatus,
  importInvoice, getPriceHistory,
};
