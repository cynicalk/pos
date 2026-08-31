const { fallbackNarrative, buildMessages } = require('../src/ai/brief.service');

/**
 * The brief's narration must survive an offline model, so the templated fallback
 * carries the same honesty rails as the figures it reads: it states only what is
 * present, says "not recorded" instead of a zero, and never invents an amount.
 * The LLM path is exercised live against LM Studio; here we pin the deterministic
 * wording and the strict prompt contract.
 */

const baseSignals = {
  date: '2026-08-30',
  sales: {
    date: '2026-08-30', traded: true, revenue: 48200, orders: 96,
    avgOrderValue: 502, covers: 140, normal: 41000,
    anomaly: { direction: 'spike', pctFromNormal: 17.6 },
  },
  topActions: [{ title: 'Coupon WELCOME50 is giving away 52%', priority: 'high', amount: 8400 }],
  margin: { windowDays: 30, revenue: 1400000, foodCostPct: 31.4, operatingMarginPct: 12.1, operatingMarginComplete: true, avgPerCover: 480, scRemovedPct: 9 },
  waste: { days: 7, totalCost: 3120, topReason: 'OVERPREP', topReasonCost: 2100 },
  peakHour: '8pm',
  couponFlag: { code: 'WELCOME50', discountRate: 52, netPerOrder: 210 },
};

describe('fallbackNarrative', () => {
  test('leads with yesterday versus normal, then the top action', () => {
    const text = fallbackNarrative(baseSignals);
    expect(text).toContain('₹48,200');
    expect(text).toContain('96 orders');
    expect(text).toContain('140 covers');
    expect(text).toMatch(/up 17.6% against a normal of ₹41,000/);
    expect(text).toContain('Coupon WELCOME50');
    expect(text).toContain('₹8,400 at stake');
    expect(text).toContain('31.4%'); // food cost note
  });

  test('a day the outlet never traded says so instead of printing a zero', () => {
    const s = { ...baseSignals, sales: { ...baseSignals.sales, traded: false, revenue: null, orders: null, covers: null } };
    const text = fallbackNarrative(s);
    expect(text).toContain('No trade recorded for 2026-08-30');
    expect(text).not.toContain('₹0');
  });

  test('no covers recorded is simply omitted, never a fabricated count', () => {
    const s = { ...baseSignals, sales: { ...baseSignals.sales, covers: null } };
    const text = fallbackNarrative(s);
    expect(text).not.toContain('covers');
  });

  test('no anomaly falls back to "in line with the usual"', () => {
    const s = { ...baseSignals, sales: { ...baseSignals.sales, anomaly: null } };
    const text = fallbackNarrative(s);
    expect(text).toContain('in line with the usual ₹41,000');
  });

  test('no open actions is stated, not skipped', () => {
    const s = { ...baseSignals, topActions: [] };
    const text = fallbackNarrative(s);
    expect(text).toContain('No open actions.');
  });

  test('an unpriceable top action shows no invented amount', () => {
    const s = { ...baseSignals, topActions: [{ title: 'Rating slipping below 4.0', priority: 'high', amount: null }] };
    const text = fallbackNarrative(s);
    expect(text).toContain('Top action: Rating slipping below 4.0.');
    expect(text).not.toMatch(/at stake/);
  });

  test('missing margin and waste degrade to silence, not zeros', () => {
    const s = { ...baseSignals, margin: null, waste: null };
    const text = fallbackNarrative(s);
    expect(text).not.toContain('food cost');
    expect(text).not.toContain('Waste');
  });
});

describe('buildMessages', () => {
  test('binds the model to the figures given and nothing else', () => {
    const msgs = buildMessages(baseSignals);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toMatch(/use ONLY the numbers/i);
    expect(msgs[0].content).toMatch(/null means that figure is not available/i);
    expect(msgs[1].role).toBe('user');
    expect(JSON.parse(msgs[1].content).sales.revenue).toBe(48200);
  });
});
