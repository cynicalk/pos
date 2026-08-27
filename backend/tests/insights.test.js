const perf = require('../src/modules/menu/performance');
const crossSell = require('../src/modules/menu/cross-sell');
const newItems = require('../src/modules/menu/new-items');
const hours = require('../src/modules/dinein/hours');
const economics = require('../src/modules/economics/unit-economics');

// Economics and menu intelligence (MERGE_PLAN.md Phase 3). All pure — the
// fetching half lives in insights.repository.js.

const dish = (name, sold, price, cost) => ({
  id: name, name, category: 'main',
  selling_price: price, cost_per_unit: cost, total_sold: sold,
  revenue: price * sold,
});

describe('menu engineering matrix', () => {
  test('splits the menu into four quadrants at its own medians', () => {
    const rows = [
      dish('Star',      100, 300, 60),  // high volume, high margin
      dish('Plowhorse', 90,  200, 150), // high volume, low margin
      dish('Puzzle',    2,   400, 80),  // low volume, high margin
      dish('Dog',       1,   150, 120), // low volume, low margin
    ];
    const m = perf.buildMatrix(perf.buildPerformance(rows));
    expect(m.stars.map((p) => p.name)).toContain('Star');
    expect(m.plowhorses.map((p) => p.name)).toContain('Plowhorse');
    expect(m.puzzles.map((p) => p.name)).toContain('Puzzle');
    expect(m.dogs.map((p) => p.name)).toContain('Dog');
  });

  test('excludes uncosted dishes rather than classifying them', () => {
    // The bug this guards: an uncosted dish has a placeholder margin of 0. Left
    // in, those zeros tie the median at 0 and drag every zero-sales dish into
    // "high margin" — an earlier version of the source put the whole menu in
    // Stars this way.
    const rows = [
      dish('Costed A', 10, 200, 50),
      dish('Costed B', 2,  200, 150),
      dish('No recipe', 8, 200, 0),
      dish('Also no recipe', 0, 300, 0),
    ];
    const m = perf.buildMatrix(perf.buildPerformance(rows));
    const classified = [...m.stars, ...m.plowhorses, ...m.puzzles, ...m.dogs].map((p) => p.name);

    expect(classified).not.toContain('No recipe');
    expect(classified).not.toContain('Also no recipe');
    expect(m.uncostedCount).toBe(2);
    expect(m.costedCount).toBe(2);
  });

  test('a dish that sold nothing is never a high-volume quadrant', () => {
    // Guards the case where the median volume itself is 0.
    const rows = [dish('Unsold', 0, 200, 50), dish('Also unsold', 0, 300, 90)];
    const m = perf.buildMatrix(perf.buildPerformance(rows));
    expect(m.stars).toHaveLength(0);
    expect(m.plowhorses).toHaveLength(0);
  });

  test('reports nothing classifiable when no dish is costed', () => {
    const m = perf.buildMatrix(perf.buildPerformance([dish('X', 5, 100, 0)]));
    expect(m.uncostedCount).toBe(1);
    expect(m.stars).toHaveLength(0);
    expect(m.medianMargin).toBeNull();
  });
});

describe('cross-sell map', () => {
  const basket = (id, ...items) => items.map((item_name) => ({ order_id: id, item_name }));

  test('multi-word dish names survive intact', () => {
    // The source joined pair keys on a space and split them back, which turned
    // "Butter Naan" + "Paneer Tikka" into "Butter" and "Naan".
    const lines = [
      ...basket('1', 'Butter Naan', 'Paneer Tikka'),
      ...basket('2', 'Butter Naan', 'Paneer Tikka'),
    ];
    const { pairs } = crossSell.buildCrossSellMap(lines);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a).toBe('Butter Naan');
    expect(pairs[0].b).toBe('Paneer Tikka');
  });

  test('two pairs whose names concatenate identically stay distinct', () => {
    // ("A B","C") and ("A","B C") both join to "A B C" under a space separator.
    const lines = [
      ...basket('1', 'A B', 'C'), ...basket('2', 'A B', 'C'),
      ...basket('3', 'A', 'B C'), ...basket('4', 'A', 'B C'),
    ];
    const { pairs } = crossSell.buildCrossSellMap(lines);
    expect(pairs).toHaveLength(2);
  });

  test('ignores a pair seen only once', () => {
    const { pairs } = crossSell.buildCrossSellMap(basket('1', 'X', 'Y'));
    expect(pairs).toHaveLength(0);
  });

  test('lift discounts a dish that is simply in every basket', () => {
    // Naan is in all four baskets, so pairing with it is not an affinity.
    const lines = [
      ...basket('1', 'Naan', 'Dal'), ...basket('2', 'Naan', 'Dal'),
      ...basket('3', 'Naan', 'Kebab'), ...basket('4', 'Naan', 'Kebab'),
    ];
    const { pairs } = crossSell.buildCrossSellMap(lines);
    for (const p of pairs) expect(p.lift).toBeCloseTo(1, 5);
  });

  test('counts baskets and the subset that can pair at all', () => {
    const lines = [...basket('1', 'A', 'B'), ...basket('2', 'A')];
    const map = crossSell.buildCrossSellMap(lines);
    expect(map.baskets).toBe(2);
    expect(map.multiItemBaskets).toBe(1);
  });
});

describe('new item tracker', () => {
  const NOW = new Date('2026-08-26T12:00:00Z').getTime();
  const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

  test('skips dishes with no recorded launch date', () => {
    // The existing menu has no created_at (migration 075) — an unknown launch
    // date is not a launch date of today.
    const built = newItems.buildNewItemPerformance(
      [{ id: '1', name: 'Old dish', created_at: null, sold: 40 }], 1, NOW,
    );
    expect(built).toHaveLength(0);
  });

  test('withholds a verdict on a dish that is only days old', () => {
    const [item] = newItems.buildNewItemPerformance(
      [{ id: '1', name: 'Fresh', created_at: daysAgo(1), sold: 0 }], 5, NOW,
    );
    expect(item.verdict).toBe('too early');
  });

  test('judges against the menu median once there is enough runway', () => {
    const rows = [{ id: '1', name: 'Hit', created_at: daysAgo(10), sold: 100 }];
    expect(newItems.buildNewItemPerformance(rows, 2, NOW)[0].verdict).toBe('outperforming');

    const slow = [{ id: '2', name: 'Miss', created_at: daysAgo(10), sold: 1 }];
    expect(newItems.buildNewItemPerformance(slow, 5, NOW)[0].verdict).toBe('slow start');
  });

  test('says there is no comparison rather than calling it on pace', () => {
    // With a median of 0 the source would have returned "on pace", which reads
    // as a measured judgement when nothing was measured.
    const [item] = newItems.buildNewItemPerformance(
      [{ id: '1', name: 'Only dish', created_at: daysAgo(10), sold: 3 }], 0, NOW,
    );
    expect(item.verdict).toBe('no comparison yet');
  });

  test('median daily rate is per dish over the observed span', () => {
    expect(newItems.medianDailyRate([10, 20, 30], 10)).toBe(2);
    expect(newItems.medianDailyRate([], 10)).toBe(0);
    expect(newItems.medianDailyRate([10], 0)).toBe(0);
  });
});

describe('service hours', () => {
  test('dead hours are the silent hours inside the service window only', () => {
    // Closed hours are not underperformance. Counting them would bury the one
    // hour that actually matters under twelve that never had a chance.
    const rows = [
      { hour: 12, orders: 10, revenue: 1000 },
      { hour: 14, orders: 0,  revenue: 0 },
      { hour: 19, orders: 25, revenue: 4000 },
    ];
    const sh = hours.buildServiceHours(rows, 7);
    expect(sh.buckets[0].hour).toBe(12);
    expect(sh.buckets[sh.buckets.length - 1].hour).toBe(19);
    expect(sh.deadHours).not.toContain(3);   // closed, not dead
    expect(sh.deadHours).toContain(13);      // inside the window, no orders
    expect(sh.peakHours).toEqual([19]);
  });

  test('an overnight service is one shift, not a day full of dead hours', () => {
    // Real seed data caught this: a 1 pm-3 am kitchen. Under the source's
    // first-to-last-hour rule the window became the whole clock and the nine
    // closed morning hours were reported as dead.
    const rows = [];
    for (const h of [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3]) {
      rows.push({ hour: h, orders: h === 17 ? 54 : 10, revenue: 100 });
    }
    const sh = hours.buildServiceHours(rows, 14);

    expect(sh.deadHours).toHaveLength(0);
    expect(sh.closedHours).toEqual(expect.arrayContaining([4, 5, 6, 7, 8, 9, 10, 11, 12]));
    expect(sh.buckets[0].hour).toBe(13);                      // opens at 1 pm
    expect(sh.buckets[sh.buckets.length - 1].hour).toBe(3);   // closes at 3 am
    expect(sh.peakHours).toEqual([17]);
  });

  test('a genuinely quiet hour mid-service is still dead', () => {
    const rows = [
      { hour: 18, orders: 20, revenue: 100 },
      { hour: 19, orders: 0,  revenue: 0 },
      { hour: 20, orders: 15, revenue: 100 },
    ];
    const sh = hours.buildServiceHours(rows, 7);
    expect(sh.deadHours).toEqual([19]);
  });

  test('labels hours the way an operator says them', () => {
    expect(hours.hourLabel(0)).toBe('12 am');
    expect(hours.hourLabel(12)).toBe('12 pm');
    expect(hours.hourLabel(19)).toBe('7 pm');
  });

  test('no trading yields no window at all', () => {
    const sh = hours.buildServiceHours([], 0);
    expect(sh.buckets).toHaveLength(0);
    expect(sh.peakHours).toHaveLength(0);
    expect(sh.totalOrders).toBe(0);
  });
});

describe('unit economics', () => {
  const base = {
    periodDays: 30,
    totals: { orders: 100, revenue: 100000, discount: 2000, coupon: 1000, loyalty: 500 },
    cancels: { totalOrders: 110, cancelledOrders: 10, lostRevenue: 8000 },
    food: { foodCost: 25000, itemRevenue: 90000, itemsCosted: 180, itemsTotal: 200 },
  };

  test('reports the operator own-side costs per order', () => {
    const e = economics.buildUnitEconomics(base);
    expect(e.costPerOrder.discountsPerOrder).toBe(35); // (2000+1000+500)/100
    expect(e.costPerOrder.foodCostPerOrder).toBe(250);
    expect(e.costPerOrder.avgOrderValue).toBe(1000);
  });

  test('names what it cannot see instead of counting it as zero', () => {
    // Platform commission, GST on it and TDS/TCS need settlements (Phase 8).
    const e = economics.buildUnitEconomics(base);
    expect(e.costPerOrder.excludes).toContain('platform commission');
    expect(e.costPerOrder.excludes).toContain('labour');
    expect(e.costPerOrder).not.toHaveProperty('totalCostPerOrder');
  });

  test('food cost percentage uses only revenue whose cost is known', () => {
    const e = economics.buildUnitEconomics(base);
    expect(e.foodCost.foodCostPct).toBeCloseTo(27.78, 2); // 25000/90000
    expect(e.foodCost.status).toBe('healthy');
    expect(e.foodCost.itemsCosted).toBe(180);
    expect(e.foodCost.itemsTotal).toBe(200);
  });

  test('an uncosted menu yields null, never a zero percentage', () => {
    const e = economics.buildUnitEconomics({
      ...base, food: { foodCost: 0, itemRevenue: 0, itemsCosted: 0, itemsTotal: 200 },
    });
    expect(e.foodCost.foodCostPct).toBeNull();
    expect(e.foodCost.status).toBe('unknown');
  });

  test('grades food cost against the QSR bands', () => {
    expect(economics.foodCostStatus(28)).toBe('healthy');
    expect(economics.foodCostStatus(33)).toBe('watch');
    expect(economics.foodCostStatus(41)).toBe('high');
    expect(economics.foodCostStatus(null)).toBe('unknown');
  });

  test('a period with no orders divides by nothing', () => {
    const e = economics.buildUnitEconomics({
      periodDays: 30,
      totals: { orders: 0, revenue: 0 },
      cancels: { totalOrders: 0, cancelledOrders: 0, lostRevenue: 0 },
      food: { foodCost: 0, itemRevenue: 0, itemsCosted: 0, itemsTotal: 0 },
    });
    expect(e.costPerOrder.avgOrderValue).toBe(0);
    expect(e.cancellation.cancellationPct).toBe(0);
    expect(e.cancellation.avgLostPerCancellation).toBe(0);
  });
});
