// Pure-function tests for the waste-insights statistics layer. No DB/HTTP — these
// exercise the math directly (rank, spearman, correlate, buildCorrelations).
const svc = require('../src/waste/waste-insights.service');

function makeDays(from, n) {
  const out = [];
  const d = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

describe('rank (average-rank, tie-aware)', () => {
  it('assigns 1-based ranks', () => {
    expect(svc.rank([10, 30, 20])).toEqual([1, 3, 2]);
  });
  it('averages tied ranks', () => {
    expect(svc.rank([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(svc.rank([5, 5, 5])).toEqual([2, 2, 2]);
  });
});

describe('spearman', () => {
  it('is +1 for a perfectly increasing monotonic relation', () => {
    expect(svc.spearman([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBe(1);
  });
  it('is -1 for a perfectly decreasing relation', () => {
    expect(svc.spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBe(-1);
  });
  it('is outlier-robust where Pearson is not', () => {
    const xs = [1, 2, 3, 4, 100], ys = [1, 2, 3, 4, 5]; // monotonic but x has a huge outlier
    const sp = svc.spearman(xs, ys);
    const pe = svc.pearson(xs, ys);
    expect(sp).toBe(1);          // ranks are still perfectly monotonic
    expect(pe).toBeLessThan(sp); // Pearson is dragged down by the outlier
  });
});

describe('correlate (Spearman + permutation significance)', () => {
  it('refuses to report below the minimum sample size', () => {
    const c = svc.correlate([1, 2, 3], [3, 2, 1]); // n=3 < 10
    expect(c.r).toBeNull();
    expect(c.p).toBeNull();
    expect(c.n).toBe(3);
  });
  it('returns null r for a degenerate (zero-variance) series', () => {
    const c = svc.correlate(Array(12).fill(5), Array.from({ length: 12 }, (_, i) => i));
    expect(c.r).toBeNull();
  });
  it('flags a strong monotonic relation as highly significant', () => {
    const xs = Array.from({ length: 14 }, (_, i) => i);
    const c = svc.correlate(xs, xs); // perfect
    expect(c.r).toBe(1);
    expect(c.p).toBeLessThan(0.05); // permutation almost never beats |1|
    expect(c.n).toBe(14);
  });
});

describe('permIterations (resolution vs multiple-comparison floor)', () => {
  const ALPHA = 0.05;
  it('keeps the floor at 1000 shuffles for a tiny family', () => {
    expect(svc.permIterations(1)).toBe(1000);
    expect(svc.permIterations(2)).toBe(1000);
  });
  it('scales K up so 1/(K+1) stays below ALPHA/m for realistic test counts', () => {
    // This is the worked check: for every plausible ingredient-family size, the
    // smallest reportable p (1/(K+1)) must sit strictly below the strictest
    // BH/Bonferroni threshold (ALPHA/m) — otherwise nothing can ever be significant.
    for (let m = 1; m <= 250; m++) {
      const K = svc.permIterations(m);
      expect(1 / (K + 1)).toBeLessThan(ALPHA / m);
    }
  });
  it('caps K to bound permutation cost', () => {
    expect(svc.permIterations(100000)).toBe(50000);
  });
});

describe('benjaminiHochberg (FDR)', () => {
  it('returns all-false for an empty/all-null family', () => {
    expect(svc.benjaminiHochberg([null, null])).toEqual([false, false]);
  });
  it('flags a clearly small p and preserves input order / nulls', () => {
    expect(svc.benjaminiHochberg([0.001, null, 0.2], 0.05)).toEqual([true, false, false]);
  });
  it('restores power over Bonferroni (step-up rejects both)', () => {
    // Bonferroni threshold is 0.05/2 = 0.025, so it would reject only the 0.02.
    // BH: largest k with p_(k) ≤ (k/2)·0.05 is k=2 (0.04 ≤ 0.05) → reject both.
    expect(svc.benjaminiHochberg([0.02, 0.04], 0.05)).toEqual([true, true]);
  });
  it('rejects nothing when every p is large', () => {
    expect(svc.benjaminiHochberg([0.4, 0.9], 0.05)).toEqual([false, false]);
  });
});

describe('buildCorrelations', () => {
  const topItems = [{ ingredient: 'X', unit: 'kg', quantity: '5', cost: '50', events: 3 }];
  const reasons = [{ reason: 'SPOILAGE', events: 3, cost: '50' }];

  it('reports weekday mean AND spread', () => {
    const days = makeDays('2026-06-01', 14);
    const dailyWaste = days.map((day, i) => ({ day, quantity: i + 1, cost: i + 1 }));
    const s = svc.buildCorrelations({ from: days[0], to: days[13], dailyWaste, weatherDays: null, topItems, reasons });
    expect(s.weekday).toHaveLength(7);
    for (const wd of s.weekday) {
      expect(wd).toHaveProperty('avg_cost');
      expect(wd).toHaveProperty('sd');
      expect(wd).toHaveProperty('days');
    }
    expect(s.weather).toBeNull();
  });

  it('does NOT promote a worst weekday without enough weeks of data', () => {
    const days = makeDays('2026-06-01', 14); // only 2 obs per weekday
    const dailyWaste = days.map((day, i) => ({ day, quantity: i + 1, cost: i + 1 }));
    const s = svc.buildCorrelations({ from: days[0], to: days[13], dailyWaste, weatherDays: null, topItems, reasons });
    expect(s.worst_weekday).toBeNull();
  });

  it('promotes a worst weekday when one day clearly and repeatedly dominates', () => {
    const days = makeDays('2026-06-01', 28); // 4 obs per weekday
    const dailyWaste = days.map((day) => ({
      day, quantity: 0,
      cost: new Date(`${day}T00:00:00Z`).getUTCDay() === 1 ? 100 : 0, // Mondays only
    }));
    const s = svc.buildCorrelations({ from: days[0], to: days[27], dailyWaste, weatherDays: null, topItems, reasons });
    expect(s.worst_weekday).not.toBeNull();
    expect(s.worst_weekday.weekday).toBe('Mon');
  });

  it('marks a strong weather relation significant (Spearman)', () => {
    const days = makeDays('2026-06-01', 14);
    const dailyWaste = days.map((day, i) => ({ day, quantity: i + 1, cost: i + 1 }));
    const weatherDays = days.map((date, i) => ({ date, rain: i + 1, temp: null })); // rain tracks cost
    const s = svc.buildCorrelations({ from: days[0], to: days[13], dailyWaste, weatherDays, topItems, reasons });
    expect(s.weather.method).toBe('spearman');
    expect(s.weather.rainfall.r).toBe(1);
    expect(s.weather.rainfall.significant).toBe(true);
  });

  it('does not flag a degenerate weather series as significant', () => {
    const days = makeDays('2026-06-01', 14);
    const dailyWaste = days.map((day, i) => ({ day, quantity: i + 1, cost: i + 1 }));
    const weatherDays = days.map((date) => ({ date, rain: 5, temp: null })); // constant rain
    const s = svc.buildCorrelations({ from: days[0], to: days[13], dailyWaste, weatherDays, topItems, reasons });
    expect(s.weather.rainfall.r).toBeNull();
    expect(s.weather.rainfall.significant).toBe(false);
  });
});
