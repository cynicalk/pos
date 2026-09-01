const { figuresGrounded, numbersFromSignals } = require('../src/ai/narrate');
const brief = require('../src/ai/brief.service');
const weekly = require('../src/ai/weekly-review.service');

/**
 * Cross-surface narration eval, as a CI gate: a surface's own HONEST FALLBACK
 * must never quote a rupee amount or percentage its signals don't contain. (The
 * live model is graded the same way at runtime by the numeric-fidelity guard; the
 * full five-surface live scorecard is scripts/eval-narration.js.) If a future
 * edit hardcodes a figure into a template, this fails.
 */

const briefSignals = {
  date: '2026-08-30',
  sales: { date: '2026-08-30', traded: true, revenue: 48200, orders: 96, avgOrderValue: 502, covers: 140, normal: 41000, anomaly: { direction: 'spike', pctFromNormal: 17.6 } },
  topActions: [{ title: 'Coupon WELCOME50 is giving away 52%', priority: 'high', amount: 8400 }],
  margin: { windowDays: 30, revenue: 1400000, foodCostPct: 31.4, operatingMarginPct: 12.1, operatingMarginComplete: true, avgPerCover: 480, scRemovedPct: 9 },
  waste: { days: 7, totalCost: 3120, topReason: 'OVERPREP', topReasonCost: 2100 },
  peakHour: '8pm',
  couponFlag: { code: 'WELCOME50', discountRate: 52, netPerOrder: 210 },
  reco: { acceptancePct: 71, verdict: 'margin_leak', highMarginSharePct: 18, underShownHighMargin: 3 },
};

const weeklySignals = {
  weekEnding: '2026-08-29',
  revenue: { thisWeek: 312000, lastWeek: 288000, changePct: 8.3, tradedDays: 7 },
  best: { date: '2026-08-23', revenue: 58200 },
  worst: { date: '2026-08-25', revenue: 31000 },
  margin: { foodCostPct: 30.4, operatingMarginPct: 13.2, avgPerCover: 510 },
  waste: { days: 7, totalCost: 4100, topReason: 'SPOILAGE' },
  attachMover: { category: 'Desserts', delta: 0.12, highMargin: true },
  reco: { acceptancePct: 66, acceptanceDeltaPts: -3, verdict: 'margin_leak', highMarginSharePct: 19 },
  topAction: { title: 'Recover the swiggy shortfall', amount: 781 },
};

describe('narration eval — fallbacks are numerically self-consistent', () => {
  test('daily brief fallback quotes only its own figures', () => {
    const text = brief.fallbackNarrative(briefSignals);
    expect(figuresGrounded(text, numbersFromSignals(briefSignals))).toBe(true);
  });

  test('daily brief fallback with no trade prints no fabricated figure', () => {
    const s = { ...briefSignals, sales: { ...briefSignals.sales, traded: false, revenue: null, orders: null, covers: null, anomaly: null } };
    const text = brief.fallbackNarrative(s);
    expect(figuresGrounded(text, numbersFromSignals(s))).toBe(true);
  });

  test('weekly review fallback quotes only its own figures', () => {
    const text = weekly.fallbackNarrative(weeklySignals);
    expect(figuresGrounded(text, numbersFromSignals(weeklySignals))).toBe(true);
  });

  test('the guard would catch a fabricated figure in any of them', () => {
    // Sanity: prove the gate isn't vacuous — an injected bad figure fails.
    expect(figuresGrounded('Yesterday took ₹9,99,999.', numbersFromSignals(briefSignals))).toBe(false);
  });
});
