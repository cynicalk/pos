const prep = require('../src/modules/forecast/prep-reconcile');

/**
 * Reconciliation is arithmetic on logged numbers, so the tests pin the honesty
 * rules around the arithmetic: actual beats plan and says so, a missing log is
 * not a zero, and selling more than prepped is a shortfall, not negative waste.
 */
describe('reconcileDish', () => {
  test('prefers the actual over the plan and names the source', () => {
    const d = prep.reconcileDish({ menuItemId: 'a', name: 'Dal', plannedQty: 40, actualQty: 38, sold: 30 });
    expect(d.prepped).toBe(38);
    expect(d.preppedSource).toBe('actual');
    expect(d.unsold).toBe(8);
    expect(d.overPrepPct).toBeCloseTo(21.05, 1);
    expect(d.status).toBe('over');
  });

  test('falls back to the plan when no actual was logged', () => {
    const d = prep.reconcileDish({ menuItemId: 'a', name: 'Dal', plannedQty: 40, actualQty: null, sold: 40 });
    expect(d.prepped).toBe(40);
    expect(d.preppedSource).toBe('planned');
    expect(d.status).toBe('on_target');
    expect(d.unsold).toBe(0);
  });

  test('a dish with neither plan nor actual is not_logged, not zero', () => {
    const d = prep.reconcileDish({ menuItemId: 'a', name: 'Dal', plannedQty: null, actualQty: null, sold: 12 });
    expect(d.status).toBe('not_logged');
    expect(d.prepped).toBeNull();
    expect(d.unsold).toBeNull();
    expect(d.overPrepPct).toBeNull();
  });

  test('selling more than prepped is a shortfall, and unsold floors at zero', () => {
    const d = prep.reconcileDish({ menuItemId: 'a', name: 'Dal', actualQty: 20, sold: 26 });
    expect(d.status).toBe('short');
    expect(d.unsold).toBe(0);
  });

  test('logged bin cost rides through as a separate figure, never merged into unsold', () => {
    const d = prep.reconcileDish({ menuItemId: 'a', name: 'Dal', actualQty: 30, sold: 22, loggedWasteCost: 145.5 });
    expect(d.unsold).toBe(8);
    expect(d.loggedWasteCost).toBe(145.5);
  });
});

describe('buildReconciliation', () => {
  const rows = [
    { menuItemId: 'a', name: 'Over', actualQty: 40, sold: 25 },       // over by 15
    { menuItemId: 'b', name: 'OnTarget', plannedQty: 20, sold: 20 },  // on target
    { menuItemId: 'c', name: 'Short', actualQty: 10, sold: 14 },      // short
    { menuItemId: 'd', name: 'Unlogged', sold: 9 },                   // not logged
  ];

  test('sorts biggest unsold first and counts coverage over logged dishes', () => {
    const r = prep.buildReconciliation(rows);
    expect(r.dishes[0].name).toBe('Over');
    expect(r.coverage.total).toBe(4);
    expect(r.coverage.logged).toBe(3);
    expect(r.coverage.planned).toBe(1);
    expect(r.coverage.actual).toBe(2);
  });

  test('totals only the logged dishes, and counts over vs short', () => {
    const r = prep.buildReconciliation(rows);
    expect(r.totals.prepped).toBe(70); // 40+20+10
    expect(r.totals.unsold).toBe(15);  // 15+0+0
    expect(r.totals.overPrepped).toBe(1);
    expect(r.totals.shortPrepped).toBe(1);
  });
});
