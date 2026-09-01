const { buildStaffPerformance } = require('../src/modules/staff/performance');

describe('buildStaffPerformance', () => {
  test('derives AOV, items/order and revenue share; sorts by revenue', () => {
    const r = buildStaffPerformance([
      { serverId: 'a', name: 'Aarav', orders: 40, revenue: 40000, items: 120 },
      { serverId: 'b', name: 'Meera', orders: 20, revenue: 60000, items: 100 },
    ]);
    expect(r.servers[0].name).toBe('Meera');           // higher revenue first
    expect(r.servers[0].avgOrderValue).toBe(3000);      // 60000/20
    expect(r.servers[0].itemsPerOrder).toBe(5);         // 100/20
    expect(r.servers[0].revenueSharePct).toBe(60);      // 60000/100000
    expect(r.totals.revenue).toBe(100000);
    expect(r.totals.avgOrderValue).toBeCloseTo(1666.67, 1);
  });

  test('a server with no orders has no AOV, not zero', () => {
    const r = buildStaffPerformance([{ serverId: 'a', name: 'Idle', orders: 0, revenue: 0, items: 0 }]);
    expect(r.servers[0].avgOrderValue).toBeNull();
    expect(r.servers[0].itemsPerOrder).toBeNull();
  });
});
