const db = require('../src/shared/db');
const procurement = require('../src/procurement/procurement.service');
const procurementRepo = require('../src/procurement/procurement.repository');
const labour = require('../src/labour/labour.service');
const { createRestaurant, deleteRestaurant } = require('./helpers');
const bcrypt = require('bcrypt');

// SQL-level coverage for Phase 4. The pure suite in procurement.test.js cannot
// see the price-history trigger, the receipt transaction, or a parameter-typing
// mistake — all three of which only exist inside Postgres.

let restaurantId;
let supplierId;
let ingredientId;
let userId;

async function makeIngredient(name, cost, stock = 0) {
  const { rows: [i] } = await db.query(
    `INSERT INTO ingredients (restaurant_id, name, unit, latest_unit_cost, stock_on_hand)
     VALUES ($1, $2, 'kg', $3, $4) RETURNING id`,
    [restaurantId, name, cost, stock],
  );
  return i.id;
}

beforeAll(async () => {
  restaurantId = await createRestaurant('Procurement Test Co');
  const { rows: [u] } = await db.query(
    `INSERT INTO users (email, password, role, restaurant_id, name, password_changed_at)
     VALUES ($1, $2, 'admin', $3, 'Test Cook', NOW() - INTERVAL '1 hour') RETURNING id`,
    [`proc-${Date.now()}@test.dev`, await bcrypt.hash('x', 4), restaurantId],
  );
  userId = u.id;

  const supplier = await procurement.createSupplier(restaurantId, {
    name: 'Fresh Produce Co', phone: '9999', leadTimeDays: 3,
  });
  supplierId = supplier.id;
  ingredientId = await makeIngredient('Test Tomato', 40, 5);
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
  await db.pool?.end?.();
});

describe('price history trigger', () => {
  test('a new ingredient records its opening cost', async () => {
    const history = await procurementRepo.getPriceHistory(ingredientId, restaurantId);
    expect(history).toHaveLength(1);
    expect(Number(history[0].cost_per_unit)).toBe(40);
  });

  test('any cost change appends a row, whichever code path made it', async () => {
    // The point of doing this in a trigger: latest_unit_cost already had two
    // write paths before Phase 4 and now has four. A trail one path can bypass
    // is not append-only.
    await db.query(
      `UPDATE ingredients SET latest_unit_cost = 55 WHERE id = $1`, [ingredientId],
    );
    const history = await procurementRepo.getPriceHistory(ingredientId, restaurantId);
    expect(history).toHaveLength(2);
    expect(Number(history[0].cost_per_unit)).toBe(55);
    expect(history[0].source).toBe('manual');
  });

  test('a write that changes nothing else does not append', async () => {
    await db.query(`UPDATE ingredients SET name = 'Test Tomato' WHERE id = $1`, [ingredientId]);
    expect(await procurementRepo.getPriceHistory(ingredientId, restaurantId)).toHaveLength(2);
  });

  test('setting the same cost again is not a price change', async () => {
    await db.query(`UPDATE ingredients SET latest_unit_cost = 55 WHERE id = $1`, [ingredientId]);
    expect(await procurementRepo.getPriceHistory(ingredientId, restaurantId)).toHaveLength(2);
  });
});

describe('invoice intake', () => {
  test('updates matched prices and labels them as invoice-sourced', async () => {
    const result = await procurement.importInvoice(
      restaurantId, 'ingredient_name,quantity,unit_cost\nTest Tomato,10,72',
    );
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0].previousCost).toBe(55);
    expect(result.updated[0].newCost).toBe(72);

    const history = await procurementRepo.getPriceHistory(ingredientId, restaurantId);
    expect(history[0].source).toBe('invoice');
    expect(Number(history[0].cost_per_unit)).toBe(72);
  });

  test('reports unmatched names rather than inventing ingredients', async () => {
    // Creating "Tomatoes" from a supplier's spelling would fork the item and
    // split its cost history in two.
    const result = await procurement.importInvoice(
      restaurantId, 'ingredient_name,quantity,unit_cost\nNot A Real Thing,1,10',
    );
    expect(result.unmatched).toEqual(['Not A Real Thing']);
    expect(result.updated).toHaveLength(0);
  });

  test('matches case-insensitively', async () => {
    const result = await procurement.importInvoice(
      restaurantId, 'ingredient_name,quantity,unit_cost\ntest tomato,10,80',
    );
    expect(result.updated).toHaveLength(1);
  });
});

describe('purchase orders', () => {
  let poId;

  test('creates a draft with a frozen line snapshot', async () => {
    const po = await procurement.createPurchaseOrder(restaurantId, {
      supplierId,
      lines: [{ ingredientId, name: 'Test Tomato', unit: 'kg', quantity: 20, unitCost: 80 }],
    }, userId);
    poId = po.id;
    expect(po.status).toBe('draft');
    expect(Number(po.total)).toBe(1600);
    expect(po.lines[0].quantity).toBe(20);
  });

  test('rejects a line with no quantity', async () => {
    await expect(procurement.createPurchaseOrder(restaurantId, {
      supplierId, lines: [{ ingredientId, name: 'Test Tomato', quantity: 0, unitCost: 80 }],
    }, userId)).rejects.toThrow(/quantity above zero/);
  });

  test('receiving books stock and writes a ledger row in one transaction', async () => {
    const before = await db.query(
      'SELECT stock_on_hand FROM ingredients WHERE id = $1', [ingredientId],
    ).then((r) => Number(r.rows[0].stock_on_hand));

    const received = await procurement.receivePurchaseOrder(poId, restaurantId, userId);
    expect(received.status).toBe('received');
    expect(received.received_at).toBeTruthy();

    const after = await db.query(
      'SELECT stock_on_hand FROM ingredients WHERE id = $1', [ingredientId],
    ).then((r) => Number(r.rows[0].stock_on_hand));
    expect(after).toBe(before + 20);

    const { rows } = await db.query(
      `SELECT txn_type, quantity_delta FROM inventory_transactions
       WHERE ingredient_id = $1 AND txn_type = 'PURCHASE'`,
      [ingredientId],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].quantity_delta)).toBe(20);
  });

  test('a delivery labels its price row as purchase-sourced', async () => {
    const history = await procurementRepo.getPriceHistory(ingredientId, restaurantId);
    // The receipt set the cost to 80, which was already the invoice price, so
    // no new row — the trigger only fires on an actual change.
    expect(history.map((h) => h.source)).toContain('invoice');
  });

  test('will not receive the same order twice', async () => {
    await expect(procurement.receivePurchaseOrder(poId, restaurantId, userId))
      .rejects.toThrow(/already received/);
  });

  test('will not move a received order back to draft', async () => {
    await expect(procurement.setPurchaseOrderStatus(poId, restaurantId, 'draft'))
      .rejects.toThrow(/stock is already booked/);
  });
});

describe('reorder positions and suggestions', () => {
  test('reports both the manual level and the computed point', async () => {
    const { items } = await procurement.getReorderPositions(restaurantId);
    const tomato = items.find((i) => i.id === ingredientId);
    expect(tomato).toBeTruthy();
    expect(tomato).toHaveProperty('manualReorderLevel');
    expect(tomato).toHaveProperty('reorderPoint');
  });

  test('suggests nothing when nothing has been consumed', async () => {
    // The ledger has only a PURCHASE for this ingredient — no usage at all —
    // so there is no defensible quantity to advise.
    const { suggestions } = await procurement.getPoSuggestions(restaurantId);
    expect(suggestions).toHaveLength(0);
  });

  test('an ingredient with usage but no supplier is reported as unassigned', async () => {
    await db.query(
      `INSERT INTO inventory_transactions
         (restaurant_id, ingredient_id, txn_type, quantity_delta, unit_cost, created_at)
       SELECT $1, $2, 'SALE', -14, 80, now() - make_interval(days => g)
       FROM generate_series(1, 10) g`,
      [restaurantId, ingredientId],
    );

    // Still unassigned at this point — it must surface somewhere rather than
    // vanish, which is the whole reason buildPoSuggestions returns this list.
    const { suggestions, unassigned } = await procurement.getPoSuggestions(restaurantId);
    expect(suggestions).toHaveLength(0);
    expect(unassigned.map((l) => l.ingredientId)).toContain(ingredientId);
  });

  test('suggests a quantity once the ingredient has a supplier', async () => {
    await procurement.assignIngredient(ingredientId, restaurantId, supplierId);
    const { suggestions } = await procurement.getPoSuggestions(restaurantId);

    expect(suggestions).toHaveLength(1);
    const line = suggestions[0].lines[0];
    // 140 used over 14 days = 10/day. Lead time 3 -> point 45. Target
    // 45 + 7x10 = 115, less 25 on hand = 90.
    expect(line.quantity).toBe(90);
    expect(suggestions[0].leadTimeDays).toBe(3);
  });
});

describe('labour', () => {
  test('refuses to log a shift with no rate anywhere', async () => {
    // Defaulting to zero would silently record free labour and understate the
    // prime cost this feature exists to make honest.
    await expect(labour.logShift(restaurantId, {
      userId, workDate: '2026-08-20', hours: 8,
    })).rejects.toThrow(/No hourly rate is set/);
  });

  test('snapshots the rate onto the shift', async () => {
    await labour.setStaffRate(userId, restaurantId, 150);
    const shift = await labour.logShift(restaurantId, {
      userId, workDate: '2026-08-20', hours: 8,
    });
    expect(Number(shift.hourly_rate)).toBe(150);

    // A later raise must not rewrite what last month cost.
    await labour.setStaffRate(userId, restaurantId, 200);
    const { rows } = await db.query(
      'SELECT hourly_rate FROM staff_shifts WHERE id = $1', [shift.id],
    );
    expect(Number(rows[0].hourly_rate)).toBe(150);
  });

  test('rejects an impossible shift length', async () => {
    await expect(labour.logShift(restaurantId, {
      userId, workDate: '2026-08-21', hours: 30,
    })).rejects.toThrow(/cannot exceed/);
  });

  test('computes totals against revenue', async () => {
    const totals = await labour.getLabourTotals(restaurantId, 30, 24000);
    expect(totals.totalHours).toBe(8);
    expect(totals.labourCost).toBe(1200);
    expect(totals.salesPerHour).toBe(3000);
  });

  test('allows only one running shift per person', async () => {
    await labour.clockIn(restaurantId, userId, 150);
    await expect(labour.clockIn(restaurantId, userId, 150))
      .rejects.toThrow(/already clocked in/);
    await labour.clockOut(restaurantId, userId);
  });
});
