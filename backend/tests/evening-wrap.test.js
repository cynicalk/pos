const { fallbackNarrative, buildMessages } = require('../src/ai/evening-wrap.service');

/**
 * The evening wrap is the daily brief's bookend, and carries the same rails: it
 * states only what today actually recorded, never invents a cash variance from a
 * count that didn't happen, and abstains where a figure is missing. Here we pin
 * the deterministic wording and the strict prompt contract.
 */

const base = {
  date: '2026-08-31',
  trade: { date: '2026-08-31', revenue: 42600, orders: 88, target: 50000, targetPct: 85.2 },
  cash: { expectedInDrawer: 18400, countedToday: true, varianceToday: -320 },
  waste: { totalCost: 640, topReason: 'OVERPREP' },
  tomorrow: { surplusValue: 845, surplusPortions: 22, chronicCount: 2, topDish: 'Dal Makhani' },
};

describe('fallbackNarrative (evening wrap)', () => {
  test('leads with trade vs target, then the cash to count', () => {
    const t = fallbackNarrative(base);
    expect(t).toContain('₹42,600');
    expect(t).toContain('88 orders');
    expect(t).toContain('85.2% of the ₹50,000 target');
    expect(t).toContain('drawer should hold ₹18,400');
    expect(t).toContain('₹320 short'); // negative variance = short
    expect(t).toContain('Dal Makhani');
  });

  test('a positive variance reads as over', () => {
    const t = fallbackNarrative({ ...base, cash: { expectedInDrawer: 18400, countedToday: true, varianceToday: 150 } });
    expect(t).toContain('₹150 over');
  });

  test('no count today states no variance', () => {
    const t = fallbackNarrative({ ...base, cash: { expectedInDrawer: 18400, countedToday: false, varianceToday: null } });
    expect(t).toContain('drawer should hold ₹18,400');
    expect(t).not.toMatch(/came up|balanced/); // no variance clause when uncounted
  });

  test('no trade yet says so, not a zero', () => {
    const t = fallbackNarrative({ ...base, trade: { date: '2026-08-31', revenue: null, orders: null, target: 50000, targetPct: null } });
    expect(t).toContain('No trade recorded for today yet');
    expect(t).not.toContain('₹0');
  });

  test('missing cash, waste and tomorrow degrade to silence', () => {
    const t = fallbackNarrative({ ...base, cash: null, waste: null, tomorrow: null });
    expect(t).toContain('₹42,600');
    expect(t).not.toContain('drawer');
    expect(t).not.toContain('over-prep');
  });

  test('no target still reports the take, without a percentage', () => {
    const t = fallbackNarrative({ ...base, trade: { date: '2026-08-31', revenue: 42600, orders: 88, target: null, targetPct: null } });
    expect(t).toContain('₹42,600');
    expect(t).not.toMatch(/% of the/);
  });
});

describe('buildMessages (evening wrap)', () => {
  test('binds the model to today and guards the cash variance meaning', () => {
    const msgs = buildMessages(base);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toMatch(/use ONLY the numbers/i);
    expect(msgs[0].content).toMatch(/only meaningful when cash.countedToday is true/i);
    expect(msgs[0].content).toMatch(/likely to be over-prepped tomorrow, not today/i);
    expect(JSON.parse(msgs[1].content).trade.revenue).toBe(42600);
  });
});
