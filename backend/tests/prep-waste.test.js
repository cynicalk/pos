const pw = require('../src/modules/forecast/prep-waste');

/**
 * Phase 2 is a projection of measured history, so the tests pin the honesty
 * rules the projection has to keep: it abstains below a history floor rather
 * than printing a zero, it prefers the target weekday but says when it fell
 * back, a short day is never negative waste, and "chronic" means what it says.
 */

// Consecutive daily dates from a start (UTC), so weekday buckets fill naturally.
function seq(startISO, n, fn) {
  const [y, m, d] = startISO.split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const iso = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    out.push({ date: iso, ...fn(i, iso) });
  }
  return out;
}

const FRIDAY = '2025-01-10'; // dayOfWeek === 5
const FRI_DOW = 5;

describe('predictOverPrep', () => {
  test('abstains below the history floor, with a reason and no number', () => {
    const days = seq('2025-01-06', 4, () => ({ prepped: 20, sold: 15 }));
    const p = pw.predictOverPrep(days, FRI_DOW);
    expect(p.surplus).toBeNull();
    expect(p.reason).toBe('not_enough_history');
    expect(p.requiredDays).toBe(pw.MIN_DAYS_FOR_DISH);
  });

  test('uses the target weekday when it has enough samples', () => {
    const days = seq('2025-01-06', 56, () => ({ prepped: 20, sold: 15 }));
    const p = pw.predictOverPrep(days, FRI_DOW);
    expect(p.basis).toBe('same_weekday');
    expect(p.weekdaySamples).toBe(8); // 56 days ≈ 8 Fridays
    expect(p.surplus).toBe(5);
    expect(p.typicalPrepped).toBe(20);
    expect(p.typicalSold).toBe(15);
  });

  test('falls back to all weekdays when the target weekday is thin, and says so', () => {
    const days = seq('2025-01-06', 10, () => ({ prepped: 12, sold: 9 })); // one Friday only
    const p = pw.predictOverPrep(days, FRI_DOW);
    expect(p.weekdaySamples).toBeLessThan(pw.MIN_SAMPLES_PER_WEEKDAY);
    expect(p.basis).toBe('all_weekday');
    expect(p.surplus).toBe(3);
  });

  test('a short day is zero surplus, never negative', () => {
    const days = seq('2025-01-06', 56, () => ({ prepped: 10, sold: 14 }));
    const p = pw.predictOverPrep(days, FRI_DOW);
    expect(p.surplus).toBe(0);
  });
});

describe('classifyChronic', () => {
  test('flags a dish that over-preps most days by a real margin', () => {
    const days = seq('2025-01-06', 56, () => ({ prepped: 20, sold: 15 }));
    const c = pw.classifyChronic(days);
    expect(c.chronic).toBe(true);
    expect(c.overShare).toBe(1);
    expect(c.medSurplus).toBe(5);
  });

  test('does not flag a dish that only occasionally leaves a little over', () => {
    const days = seq('2025-01-06', 56, (i) => ({ prepped: 20, sold: i % 20 === 0 ? 19 : 20 }));
    const c = pw.classifyChronic(days);
    expect(c.chronic).toBe(false);
  });

  test('abstains from a chronic verdict below the history floor', () => {
    const days = seq('2025-01-06', 5, () => ({ prepped: 20, sold: 10 }));
    expect(pw.classifyChronic(days).chronic).toBe(false);
  });
});

describe('buildPrepForecast', () => {
  const chronic = { menuItemId: 'a', name: 'Biryani', unitCost: 10, forecastQty: 15,
    days: seq('2025-01-06', 56, () => ({ prepped: 20, sold: 15 })) };
  const thin = { menuItemId: 'b', name: 'Special', unitCost: 8, forecastQty: null,
    days: seq('2025-01-06', 4, () => ({ prepped: 10, sold: 5 })) };

  const out = pw.buildPrepForecast({ dishes: [thin, chronic], targetDate: FRIDAY });

  test('ranks chronic over-preppers first and sinks dishes it cannot forecast', () => {
    expect(out.dishes[0].menuItemId).toBe('a');
    expect(out.dishes[0].status).toBe('chronic');
    expect(out.dishes[out.dishes.length - 1].status).toBe('insufficient');
  });

  test('values the surplus only where a recipe cost exists', () => {
    const a = out.dishes.find((d) => d.menuItemId === 'a');
    expect(a.predictedSurplus).toBe(5);
    expect(a.valuedSurplus).toBe(50); // 5 portions × ₹10
  });

  test('summary counts predicted, insufficient and chronic honestly', () => {
    expect(out.summary.total).toBe(2);
    expect(out.summary.predicted).toBe(1);
    expect(out.summary.insufficient).toBe(1);
    expect(out.summary.chronic).toBe(1);
    expect(out.summary.totalSurplusValue).toBe(50);
    expect(out.summary.valueCoveragePct).toBe(100);
  });
});
