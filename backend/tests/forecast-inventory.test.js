const inventory = require('../src/modules/forecast/inventory');

/**
 * The stock projection and reorder plan are pure arithmetic on top of the
 * forecast — which is exactly why they are worth pinning. A wrong depletion date
 * or a reorder that fires too late is a stockout the operator was told wouldn't
 * happen.
 */
describe('inventory.project', () => {
  const H = 5;
  const ing = (over) => ({
    id: 'i1', name: 'Chicken', unit: 'kg', stockOnHand: 10, reorderLevel: 3,
    reorderQty: 8, unitCost: 300, perishable: true, ...over,
  });

  test('walks stock down and finds the reorder and stockout days', () => {
    const [p] = inventory.project([ing()], { i1: [2, 2, 2, 2, 2] }, H);
    // 10 → 8 → 6 → 4 → 2 → 0. Reorder level 3 first crossed at day 4 (stock 2),
    // stockout (<=0) at day 5.
    expect(p.status).toBe('stockout_within_horizon');
    expect(p.daysToReorderLevel).toBe(4);
    expect(p.daysToStockout).toBe(5);
    expect(p.projectedEndStock).toBeCloseTo(0);
    expect(p.dailyBurn).toBeCloseTo(2);
  });

  test('an ingredient already at/below its reorder level reads as below-now', () => {
    const [p] = inventory.project([ing({ stockOnHand: 3 })], { i1: [1, 1, 1, 1, 1] }, H);
    expect(p.status).toBe('below_reorder_now');
    expect(p.daysToReorderLevel).toBe(0);
  });

  test('stays ok when the horizon never reaches the reorder level', () => {
    const [p] = inventory.project([ing({ stockOnHand: 100 })], { i1: [2, 2, 2, 2, 2] }, H);
    expect(p.status).toBe('ok');
    expect(p.daysToReorderLevel).toBeNull();
    expect(p.daysToStockout).toBeNull();
  });

  test('no forecast consumption means no invented depletion date', () => {
    const [p] = inventory.project([ing({ stockOnHand: 1 })], { i1: [0, 0, 0, 0, 0] }, H);
    // Below the reorder level on hand, but nothing draws it down — we do not
    // pretend to know when it runs out.
    expect(p.status).toBe('no_forecast_demand');
    expect(p.drawnByForecast).toBe(false);
    expect(p.daysToStockout).toBeNull();
  });

  test('sorts soonest-to-run-out first, forecast-blind ingredients last', () => {
    const items = [
      ing({ id: 'safe', name: 'Safe', stockOnHand: 100 }),
      ing({ id: 'soon', name: 'Soon', stockOnHand: 6 }),
      ing({ id: 'blind', name: 'Blind', stockOnHand: 1 }),
    ];
    const cons = { safe: [1, 1, 1, 1, 1], soon: [2, 2, 2, 2, 2], blind: [0, 0, 0, 0, 0] };
    const order = inventory.project(items, cons, H).map((p) => p.id);
    expect(order[0]).toBe('soon');
    expect(order[order.length - 1]).toBe('blind');
  });
});

describe('inventory.reorderPlan', () => {
  const H = 10;
  const project = (over) => inventory.project([{
    id: 'i1', name: 'Chicken', unit: 'kg', stockOnHand: 10, reorderLevel: 3,
    reorderQty: 8, unitCost: 300, perishable: false, ...over.ing,
  }], { i1: over.cons }, H);

  test('reorders when the level is crossed within the lead time', () => {
    // burn 3/day → crosses level 3 (stock 3) at day 3, within lead 3.
    const proj = project({ ing: { stockOnHand: 12, reorderQty: 20 }, cons: Array(H).fill(3) });
    const [s] = inventory.reorderPlan(proj, { leadDays: 3, reviewDays: 4 });
    expect(s).toBeTruthy();
    expect(s.suggestedQty).toBe(20);          // configured reorder_qty wins
    expect(s.qtyBasis).toBe('configured_reorder_qty');
  });

  test('does not reorder when the level is only crossed after the lead time', () => {
    // burn 1/day, stock 10, level 3 → crossed at day 7, past lead 3.
    const proj = project({ ing: { stockOnHand: 10 }, cons: Array(H).fill(1) });
    expect(inventory.reorderPlan(proj, { leadDays: 3 })).toHaveLength(0);
  });

  test('falls back to forecast demand when reorder_qty is unset', () => {
    const proj = project({ ing: { stockOnHand: 3, reorderQty: 0 }, cons: Array(H).fill(2) });
    const [s] = inventory.reorderPlan(proj, { leadDays: 3, reviewDays: 4 });
    expect(s.qtyBasis).toBe('forecast_demand');
    // cover (3+4)=7 days at burn 2 = 14, + level 3 - stock 3 = 14.
    expect(s.suggestedQty).toBeCloseTo(14);
  });

  test('flags a perishable whose order outlasts a few days of demand', () => {
    const proj = project({ ing: { stockOnHand: 3, perishable: true, reorderQty: 100 }, cons: Array(H).fill(2) });
    const [s] = inventory.reorderPlan(proj, { leadDays: 3 });
    // 100 kg at 2/day = 50 days of cover, well past PERISHABLE_COVER_DAYS.
    expect(s.perishableWasteRisk).toBe(true);
  });
});
