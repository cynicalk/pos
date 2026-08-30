const { buildApc, buildScRemoved } = require('../src/modules/economics/billing-metrics');

/**
 * Wave 3 metrics ride on capture the billing flow only just started recording,
 * so the tests pin the coverage rail and the abstention: no covers means no APC
 * (not a divide-by-zero), and no waivable bill means no removed-rate (not 0%).
 */

describe('buildApc', () => {
  test('spend per cover over the bills that carried a guest count', () => {
    const a = buildApc({ revenue: 12000, covers: 40, coveredOrders: 10, diningOrders: 25 });
    expect(a.apc).toBe(300);        // 12000 / 40 guests
    expect(a.coveragePct).toBe(40); // 10 of 25 dining bills carried covers
  });

  test('abstains until at least one bill has a guest count', () => {
    const a = buildApc({ revenue: 0, covers: 0, coveredOrders: 0, diningOrders: 25 });
    expect(a.apc).toBeNull();
    expect(a.coveragePct).toBe(0);
  });
});

describe('buildScRemoved', () => {
  const totals = { applicable: 50, waived: 13, waivedSubtotal: 26000 };
  const byServer = [
    { server: 'Riya',  applicable: 20, waived: 10 },
    { server: 'Arjun', applicable: 20, waived: 3 },
    { server: 'Noor',  applicable: 0,  waived: 0 }, // never had a waivable bill
  ];

  test('removed rate and an estimate of the foregone charge', () => {
    const r = buildScRemoved(totals, byServer, { scRate: 0.10 });
    expect(r.removedPct).toBe(26);           // 13 of 50
    expect(r.estimatedForegone).toBe(2600);  // 26000 subtotal × 10%
  });

  test('ranks servers by removal rate and drops those with no applicable bill', () => {
    const r = buildScRemoved(totals, byServer, { scRate: 0.10 });
    expect(r.servers.map((s) => s.server)).toEqual(['Riya', 'Arjun']);
    expect(r.servers[0].removedPct).toBe(50); // 10 of 20
  });

  test('no waivable bill means no rate, not zero percent', () => {
    const r = buildScRemoved({ applicable: 0, waived: 0, waivedSubtotal: 0 }, [], { scRate: 0.10 });
    expect(r.removedPct).toBeNull();
    expect(r.estimatedForegone).toBe(0);
    expect(r.servers).toEqual([]);
  });
});
