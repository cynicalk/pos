/**
 * Purchase-order drafting and invoice parsing — ported from
 * `src/modules/procurement/suppliers.ts`, kept pure.
 *
 * ── The suggestion got better in the port ──────────────────────────────────
 *
 * The source said plainly: "The PO Generator has no inventory levels to work
 * from (deliberately not invented), so its suggestion is consumption-based:
 * what the kitchen used in the last 14 days, scaled to a 7-day buy."
 *
 * POS *does* have inventory levels — a real ledger keeps `stock_on_hand`
 * current — so the suggestion here is need-based instead: cover the lead time
 * and the buy period, then subtract what is already in the store. Ordering a
 * flat week's usage regardless of a full shelf is how a walk-in fills up with
 * stock that spoils before it is used.
 */

const CONSUMPTION_DAYS = 14;
const BUY_DAYS = 7;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Quantity to order for one ingredient.
 *
 * target = demand over (lead time + buy period) + safety buffer on the lead
 * time, which is exactly the reorder point plus the buy period's usage.
 * Ordering nothing is a valid answer and is returned as 0.
 */
function suggestedQuantity({ dailyUsage, onHand, leadTimeDays, reorderPoint, buyDays = BUY_DAYS }) {
  if (!(dailyUsage > 0)) return 0; // no observed usage — no defensible quantity
  const target = reorderPoint + dailyUsage * buyDays;
  return Math.max(0, Math.ceil((target - onHand) * 100) / 100);
}

/**
 * Build one draft per supplier from the ingredients assigned to them.
 *
 * Ingredients with no supplier are reported separately rather than silently
 * dropped — an unassigned ingredient that needs ordering is exactly the thing
 * an operator would otherwise never be told about.
 */
function buildPoSuggestions(rows, { buyDays = BUY_DAYS } = {}) {
  const bySupplier = new Map();
  const unassigned = [];

  for (const row of rows) {
    const quantity = suggestedQuantity({
      dailyUsage: Number(row.daily_usage || 0),
      onHand: Number(row.stock_on_hand || 0),
      leadTimeDays: Number(row.lead_time_days ?? 2),
      reorderPoint: Number(row.reorder_point || 0),
      buyDays,
    });
    if (quantity <= 0) continue;

    const unitCost = Number(row.latest_unit_cost || 0);
    const line = {
      ingredientId: row.id,
      name: row.name,
      unit: row.unit,
      quantity,
      unitCost,
      lineTotal: round2(quantity * unitCost),
      // Surfaced so the operator can see which lines are priced from a real
      // cost and which would go out at zero.
      hasCost: unitCost > 0,
    };

    if (!row.supplier_id) { unassigned.push(line); continue; }

    let draft = bySupplier.get(row.supplier_id);
    if (!draft) {
      draft = {
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        leadTimeDays: Number(row.lead_time_days ?? 2),
        lines: [],
        total: 0,
      };
      bySupplier.set(row.supplier_id, draft);
    }
    draft.lines.push(line);
    draft.total = round2(draft.total + line.lineTotal);
  }

  return {
    buyDays,
    consumptionDays: CONSUMPTION_DAYS,
    suggestions: [...bySupplier.values()].sort((a, b) => b.total - a.total),
    unassigned,
  };
}

/**
 * Parse a supplier invoice CSV into price updates.
 *
 * Expected header: ingredient_name, quantity, unit_cost. Rows that don't parse
 * are RETURNED as errors rather than skipped silently — an invoice line that
 * quietly vanished would leave the operator believing a price was updated when
 * it wasn't, and the price history is what every margin figure reads from.
 */
function parseInvoiceCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], errors: ['The file is empty.'] };

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf('ingredient_name');
  const qtyIdx = header.indexOf('quantity');
  const costIdx = header.indexOf('unit_cost');

  if (nameIdx === -1 || costIdx === -1) {
    return {
      rows: [],
      errors: ['The file needs at least ingredient_name and unit_cost columns.'],
    };
  }

  const rows = [];
  const errors = [];

  lines.slice(1).forEach((raw, i) => {
    const lineNo = i + 2; // 1-indexed, and the header is line 1
    const cells = raw.split(',');
    const name = (cells[nameIdx] || '').trim();
    const unitCost = Number((cells[costIdx] || '').trim());
    const quantity = qtyIdx === -1 ? null : Number((cells[qtyIdx] || '').trim());

    if (!name) { errors.push(`Line ${lineNo}: no ingredient name.`); return; }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      errors.push(`Line ${lineNo}: "${name}" has an unreadable unit cost.`);
      return;
    }
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
      errors.push(`Line ${lineNo}: "${name}" has an unreadable quantity.`);
      return;
    }
    rows.push({ name, unitCost, quantity });
  });

  return { rows, errors };
}

/**
 * Percentage change between two unit costs.
 * Null when there is no previous price to compare against — a first price is
 * not a 100% increase.
 */
function priceChangePct(previous, current) {
  const prev = Number(previous);
  const curr = Number(current);
  if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

module.exports = {
  CONSUMPTION_DAYS, BUY_DAYS,
  suggestedQuantity, buildPoSuggestions, parseInvoiceCsv, priceChangePct,
};
