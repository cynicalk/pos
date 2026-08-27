const inventory = require('../src/modules/kitchen/inventory');
const purchasing = require('../src/modules/procurement/purchasing');
const labour = require('../src/modules/labour/hours');
const engine = require('../src/modules/rules/engine');

// Kitchen, procurement and labour (MERGE_PLAN.md Phase 4). Pure — the SQL half
// is covered in procurement-db.test.js.

describe('reorder point', () => {
  test('covers lead-time demand plus a safety buffer', () => {
    // 10/day over a 2-day lead time = 20, plus 50% safety = 30.
    expect(inventory.reorderPoint(10, 2)).toBe(30);
  });

  test('a longer lead time raises the point proportionally', () => {
    expect(inventory.reorderPoint(10, 4)).toBe(60);
  });

  test('no observed usage yields no reorder advice', () => {
    // Suggesting a quantity with nothing consumed would be a guess dressed as
    // arithmetic.
    const pos = inventory.buildReorderPosition({ onHand: 5, dailyUsage: 0, leadTimeDays: 3 });
    expect(pos.reorderPoint).toBe(0);
    expect(pos.shouldReorder).toBe(false);
    expect(pos.hasUsageSignal).toBe(false);
  });

  test('negative or non-finite inputs never produce advice', () => {
    expect(inventory.reorderPoint(-5, 2)).toBe(0);
    expect(inventory.reorderPoint(NaN, 2)).toBe(0);
    expect(inventory.reorderPoint(10, Infinity)).toBe(0);
  });

  test('flags an ingredient at or below its point', () => {
    expect(inventory.buildReorderPosition({ onHand: 30, dailyUsage: 10, leadTimeDays: 2 }).shouldReorder).toBe(true);
    expect(inventory.buildReorderPosition({ onHand: 31, dailyUsage: 10, leadTimeDays: 2 }).shouldReorder).toBe(false);
  });
});

describe('days of cover', () => {
  test('is null when nothing consumes the ingredient', () => {
    // Infinite cover. A number here — or a 0 — would be worse than silence.
    expect(inventory.daysOfCover(50, 0)).toBeNull();
  });

  test('is zero, never negative, when stock has gone below zero', () => {
    // Seen on real data: a ledger that has run ahead of its last count leaves
    // negative stock, and "-6.8 days of cover" is not something anyone can act
    // on. The shortfall itself stays visible in onHand.
    const pos = inventory.buildReorderPosition({ onHand: -14, dailyUsage: 2, leadTimeDays: 3 });
    expect(pos.daysOfCover).toBe(0);
    expect(pos.onHand).toBe(-14);
    expect(pos.shouldReorder).toBe(true);
  });

  test('caps rather than reporting a falsely precise figure', () => {
    const pos = inventory.buildReorderPosition({ onHand: 100000, dailyUsage: 1, leadTimeDays: 2 });
    expect(pos.daysOfCover).toBe(inventory.COVER_CAP_DAYS);
    expect(pos.coverCapped).toBe(true);
  });
});

describe('purchase order suggestions', () => {
  const row = (over) => ({
    id: 'i1', name: 'Tomato', unit: 'kg', supplier_id: 's1', supplier_name: 'Fresh Co',
    lead_time_days: 2, stock_on_hand: 0, daily_usage: 10, latest_unit_cost: 40,
    reorder_point: 30, ...over,
  });

  test('orders to cover the lead time and the buy period, less what is on hand', () => {
    // reorder point 30 + 7 days x 10 = 100 target, minus 20 on hand = 80.
    const { suggestions } = purchasing.buildPoSuggestions([row({ stock_on_hand: 20 })]);
    expect(suggestions[0].lines[0].quantity).toBe(80);
  });

  test('a full shelf is not re-ordered', () => {
    // The source could not do this — it had no stock levels and ordered a flat
    // week's usage regardless, which fills a walk-in with stock that spoils.
    const { suggestions } = purchasing.buildPoSuggestions([row({ stock_on_hand: 500 })]);
    expect(suggestions).toHaveLength(0);
  });

  test('an ingredient with no usage is never suggested', () => {
    const { suggestions } = purchasing.buildPoSuggestions([row({ daily_usage: 0 })]);
    expect(suggestions).toHaveLength(0);
  });

  test('unassigned ingredients are reported, not dropped', () => {
    // An ingredient nobody supplies that still needs ordering is exactly what
    // an operator would otherwise never be told.
    const { suggestions, unassigned } = purchasing.buildPoSuggestions([
      row({ supplier_id: null, supplier_name: null }),
    ]);
    expect(suggestions).toHaveLength(0);
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].name).toBe('Tomato');
  });

  test('groups lines per supplier and marks uncosted ones', () => {
    const { suggestions } = purchasing.buildPoSuggestions([
      row(),
      row({ id: 'i2', name: 'Onion', latest_unit_cost: 0 }),
    ]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].lines).toHaveLength(2);
    expect(suggestions[0].lines.find((l) => l.name === 'Onion').hasCost).toBe(false);
  });
});

describe('invoice CSV parsing', () => {
  test('reads the expected columns', () => {
    const { rows, errors } = purchasing.parseInvoiceCsv(
      'ingredient_name,quantity,unit_cost\nTomato,10,45.5\nOnion,5,30',
    );
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      { name: 'Tomato', quantity: 10, unitCost: 45.5 },
      { name: 'Onion', quantity: 5, unitCost: 30 },
    ]);
  });

  test('reports unreadable lines instead of skipping them silently', () => {
    // A vanished line leaves the operator believing a price updated when it
    // did not, and the price history is what every margin figure reads.
    const { rows, errors } = purchasing.parseInvoiceCsv(
      'ingredient_name,quantity,unit_cost\nTomato,10,45\n,5,30\nOnion,5,abc',
    );
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[1]).toContain('Onion');
  });

  test('rejects a file without the required columns', () => {
    const { rows, errors } = purchasing.parseInvoiceCsv('name,price\nTomato,45');
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain('ingredient_name');
  });
});

describe('price change', () => {
  test('a first-ever price is not an increase', () => {
    expect(purchasing.priceChangePct(0, 50)).toBeNull();
    expect(purchasing.priceChangePct(null, 50)).toBeNull();
  });

  test('computes a signed percentage', () => {
    expect(purchasing.priceChangePct(40, 50)).toBeCloseTo(25, 5);
    expect(purchasing.priceChangePct(50, 40)).toBeCloseTo(-20, 5);
  });
});

describe('cost spike rule', () => {
  const rule = {
    id: 'r1', enabled: true, severity: 'medium', rule_type: 'cost_spike',
    condition: { field: 'cost_increase_pct', op: '>', value: 15 },
    message_template: '{ingredient} rose {cost_increase_pct}% to {current_cost}/{unit}. Affects {dishes}.',
  };
  const change = (over) => ({
    ingredient_id: 'i1', name: 'Tomato', unit: 'kg',
    previous_cost: 40, current_cost: 50, recorded_at: '2026-08-26T10:00:00Z',
    dishes: ['Butter Chicken'], ...over,
  });

  test('fires above the threshold and names the dishes hit', () => {
    const [a] = engine.evaluateCostSpikes([rule], { priceChanges: [change()] });
    expect(a.title).toContain('25.0%');
    expect(a.description).toContain('Butter Chicken');
  });

  test('stays quiet for an ordinary move', () => {
    expect(engine.evaluateCostSpikes([rule], {
      priceChanges: [change({ current_cost: 44 })],
    })).toHaveLength(0);
  });

  test('a first-ever price is never a spike', () => {
    expect(engine.evaluateCostSpikes([rule], {
      priceChanges: [change({ previous_cost: 0 })],
    })).toHaveLength(0);
  });

  test('a price fall is not a spike', () => {
    expect(engine.evaluateCostSpikes([rule], {
      priceChanges: [change({ current_cost: 20 })],
    })).toHaveLength(0);
  });

  test('keys per price row so one jump alerts once', () => {
    const first = engine.evaluateCostSpikes([rule], { priceChanges: [change()] })[0];
    const again = engine.evaluateCostSpikes([rule], { priceChanges: [change()] })[0];
    expect(first.dedupeKey).toBe(again.dedupeKey);

    const later = engine.evaluateCostSpikes([rule], {
      priceChanges: [change({ recorded_at: '2026-09-01T10:00:00Z', current_cost: 70 })],
    })[0];
    expect(later.dedupeKey).not.toBe(first.dedupeKey);
  });

  test('says so when no costed dish uses the ingredient', () => {
    const [a] = engine.evaluateCostSpikes([rule], { priceChanges: [change({ dishes: [] })] });
    expect(a.description).toContain('no costed dish yet');
  });
});

describe('labour hours', () => {
  const at = (h) => new Date(`2026-08-26T${String(h).padStart(2, '0')}:00:00Z`);

  test('measures an ordinary shift', () => {
    expect(labour.hoursBetween(at(9), at(17))).toBe(8);
  });

  test('never returns negative hours', () => {
    // A negative shift would REDUCE labour cost — a wrong number that reads as
    // a good one.
    expect(labour.hoursBetween(at(17), at(9))).toBe(0);
  });

  test('caps a forgotten clock-out', () => {
    const out = new Date('2026-08-29T09:00:00Z');
    expect(labour.hoursBetween(at(9), out)).toBe(labour.MAX_SHIFT_HOURS);
  });

  test('flags shifts whose stamps say the stored hours are wrong', () => {
    expect(labour.reviewShift(at(9), at(17))).toBeNull();
    expect(labour.reviewShift(at(17), at(9)).flag).toBe('reversed');
    expect(labour.reviewShift(at(9), new Date('2026-08-29T09:00:00Z')).flag).toBe('capped');
    expect(labour.reviewShift(at(9), null, new Date('2026-08-29T09:00:00Z')).flag).toBe('running_over');
  });
});

describe('labour totals and prime cost', () => {
  const shifts = [{ hours: 8, hourly_rate: 100 }, { hours: 6, hourly_rate: 120 }];

  test('aggregates hours, cost and efficiency', () => {
    const t = labour.computeLabourTotals(shifts, 42000);
    expect(t.totalHours).toBe(14);
    expect(t.labourCost).toBe(1520);
    expect(t.salesPerHour).toBe(3000);
    expect(t.labourPct).toBeCloseTo(3.62, 1);
  });

  test('reports null, not zero, when no hours are logged', () => {
    // Zero would read as "we sell nothing per labour hour".
    const t = labour.computeLabourTotals([], 42000);
    expect(t.salesPerHour).toBeNull();
    expect(t.labourPct).toBeNull();
  });

  test('withholds prime cost until both halves exist', () => {
    // A prime cost without labour is a food cost wearing its name, and it
    // flatters the operator by exactly what they pay their staff.
    const p = labour.computePrimeCost({
      foodCost: 25000, labourCost: 0, revenue: 100000,
      hasFoodCost: true, hasLabour: false,
    });
    expect(p.primeCost).toBeNull();
    expect(p.primeCostPct).toBeNull();
    expect(p.complete).toBe(false);
    expect(p.missing[0]).toContain('labour');
  });

  test('reports the full prime cost once both are known', () => {
    const p = labour.computePrimeCost({
      foodCost: 25000, labourCost: 15000, revenue: 100000,
      hasFoodCost: true, hasLabour: true,
    });
    expect(p.primeCost).toBe(40000);
    expect(p.primeCostPct).toBe(40);
    expect(p.complete).toBe(true);
    expect(p.missing).toHaveLength(0);
  });
});
