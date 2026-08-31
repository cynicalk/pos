const { fallbackNarrative, buildMessages } = require('../src/ai/weekly-review.service');

/**
 * The weekly review is the daily brief one horizon up, and carries the same
 * honesty rails: it abstains where there's no prior week to compare, states
 * "not recorded" instead of a zero, and never invents an amount. Here we pin
 * the deterministic wording and the strict prompt contract.
 */

const base = {
  weekEnding: '2026-08-29',
  revenue: { thisWeek: 312000, lastWeek: 288000, changePct: 8.3, tradedDays: 7 },
  best: { date: '2026-08-23', revenue: 58200 },
  worst: { date: '2026-08-26', revenue: 31100 },
  margin: { foodCostPct: 30.4, operatingMarginPct: 13.2, avgPerCover: 510 },
  waste: { days: 7, totalCost: 4200, topReason: 'OVERPREP' },
  attachMover: { category: 'Desserts', delta: -0.06, highMargin: true },
  topAction: { title: 'Coupon WELCOME50 is giving away 52%', amount: 8400 },
};

describe('fallbackNarrative (weekly)', () => {
  test('leads with the week-over-week trend, then the best day', () => {
    const t = fallbackNarrative(base);
    expect(t).toContain('₹3,12,000');
    expect(t).toContain('7 trading days');
    expect(t).toMatch(/up 8.3% on last week's ₹2,88,000/);
    expect(t).toContain('Best day was 2026-08-23 at ₹58,200');
    expect(t).toContain('30.4%');
  });

  test('recommender line: leak stated, else acceptance move, else nothing', () => {
    expect(fallbackNarrative(base)).not.toMatch(/recommender|pick acceptance/i);
    const leak = { ...base, reco: { acceptancePct: 60, acceptanceDeltaPts: -2, verdict: 'margin_leak', highMarginSharePct: 19 } };
    expect(fallbackNarrative(leak)).toMatch(/leaned to low-margin dishes — 19%/);
    const moved = { ...base, reco: { acceptancePct: 71, acceptanceDeltaPts: 9, verdict: 'healthy', highMarginSharePct: 64 } };
    expect(fallbackNarrative(moved)).toMatch(/acceptance was 71%, up 9 points/);
  });

  test('no prior week abstains instead of inventing a change', () => {
    const s = { ...base, revenue: { thisWeek: 120000, lastWeek: 0, changePct: null, tradedDays: 4 } };
    const t = fallbackNarrative(s);
    expect(t).toContain('no prior week to compare');
    expect(t).not.toMatch(/up .*%|down .*%/);
  });

  test('a silent week says so, not a zero', () => {
    const s = { ...base, revenue: { thisWeek: 0, lastWeek: 0, changePct: null, tradedDays: 0 }, best: null };
    const t = fallbackNarrative(s);
    expect(t).toContain('No trade recorded in the last seven days');
    expect(t).not.toContain('₹0');
  });

  test('an unpriceable action shows no invented amount', () => {
    const s = { ...base, topAction: { title: 'Rating slipping', amount: null } };
    const t = fallbackNarrative(s);
    expect(t).toContain('Biggest open action: Rating slipping.');
    expect(t).not.toMatch(/\(₹/);
  });

  test('missing margin and waste degrade to silence', () => {
    const s = { ...base, margin: null, waste: null, topAction: null };
    const t = fallbackNarrative(s);
    expect(t).not.toContain('Food cost');
    expect(t).not.toContain('Waste');
  });
});

describe('buildMessages (weekly)', () => {
  test('binds the model to the given figures for the week', () => {
    const msgs = buildMessages(base);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toMatch(/use ONLY the numbers/i);
    expect(msgs[0].content).toMatch(/changePct compares this week to last week/i);
    expect(JSON.parse(msgs[1].content).revenue.thisWeek).toBe(312000);
  });
});
