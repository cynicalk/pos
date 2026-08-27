/*
 * Phase 9 — sales anomaly detection (MERGE_PLAN.md).
 *
 * The MAD test itself is textbook; what is worth pinning is everything around
 * it — when it refuses to judge, what it counts as normal, and the partial-day
 * trap that made the source flag every morning as a catastrophe.
 */

const { detectAnomalies, median, MIN_BASELINE_DAYS } =
  require('../src/modules/analytics/anomaly');
const { evaluateRevenueAnomaly } = require('../src/modules/rules/anomaly-rule');
const engine = require('../src/modules/rules/engine');

const day = (n) => `2026-07-${String(n).padStart(2, '0')}`;

/** A steady series with a little spread, so MAD is non-zero. */
const steady = (count, base = 10000) =>
  Array.from({ length: count }, (_, i) => ({
    date: day(i + 1),
    revenue: base + ((i % 5) - 2) * 200,
  }));

describe('median', () => {
  test('odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  test('empty is zero', () => {
    expect(median([])).toBe(0);
  });
});

describe('refusing to judge', () => {
  test('reports no baseline below the minimum trading days', () => {
    const r = detectAnomalies(steady(10), { recentDays: 3 });
    expect(r.hasBaseline).toBe(false);
    expect(r.normal).toBeNull();
    expect(r.anomalies).toEqual([]);
    expect(r.minBaselineDays).toBe(MIN_BASELINE_DAYS);
  });

  test('closed days do not count towards the baseline', () => {
    // A stretch of zeros before the restaurant opened is not evidence about
    // today, so it must not be able to satisfy the minimum on its own.
    const series = [
      ...Array.from({ length: 20 }, (_, i) => ({ date: day(i + 1), revenue: 0 })),
      ...steady(5).map((d, i) => ({ ...d, date: day(21 + i) })),
    ];
    expect(detectAnomalies(series, { recentDays: 2 }).hasBaseline).toBe(false);
  });

  test('an empty series judges nothing', () => {
    expect(detectAnomalies([]).hasBaseline).toBe(false);
    expect(detectAnomalies().anomalies).toEqual([]);
  });
});

describe('detecting drops and spikes', () => {
  const withRecent = (recentRevenues) => {
    const base = steady(30);
    const recent = recentRevenues.map((revenue, i) => ({ date: day(31 + i), revenue }));
    return [...base, ...recent];
  };

  test('a normal day is not flagged', () => {
    const r = detectAnomalies(withRecent([10000]), { recentDays: 1 });
    expect(r.hasBaseline).toBe(true);
    expect(r.anomalies).toEqual([]);
  });

  test('a collapse is flagged as a drop', () => {
    const r = detectAnomalies(withRecent([2000]), { recentDays: 1 });
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].direction).toBe('drop');
    expect(r.anomalies[0].pctFromNormal).toBeLessThan(0);
  });

  test('a closed day is kept and flagged, not skipped', () => {
    // A day with no trade at all is the anomaly most worth seeing.
    const r = detectAnomalies(withRecent([0]), { recentDays: 1 });
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].revenue).toBe(0);
    expect(r.anomalies[0].direction).toBe('drop');
  });

  test('an exceptional day is flagged as a spike', () => {
    const r = detectAnomalies(withRecent([40000]), { recentDays: 1 });
    expect(r.anomalies[0].direction).toBe('spike');
  });

  test('the comparison figure travels with the finding', () => {
    // So an alert can say what it is comparing against rather than asserting a
    // bare percentage.
    const r = detectAnomalies(withRecent([2000]), { recentDays: 1 });
    expect(r.anomalies[0].normal).toBeGreaterThan(0);
  });

  test('a flat baseline falls back to a percentage rather than dividing by zero', () => {
    const flat = Array.from({ length: 30 }, (_, i) => ({ date: day(i + 1), revenue: 5000 }));
    const r = detectAnomalies([...flat, { date: day(31), revenue: 1000 }], { recentDays: 1 });
    expect(r.anomalies).toHaveLength(1);
    // No z-score is claimed, because there was no spread to measure against.
    expect(r.anomalies[0].score).toBeNull();
    expect(Number.isFinite(r.anomalies[0].pctFromNormal)).toBe(true);
  });

  test('findings are newest first', () => {
    const r = detectAnomalies(withRecent([1000, 1000]), { recentDays: 2 });
    expect(r.anomalies[0].date > r.anomalies[1].date).toBe(true);
  });
});

describe('today is never judged', () => {
  const series = [...steady(30), { date: day(31), revenue: 1200 }];

  test('the partial current day is excluded', () => {
    // The source judged today, so from opening until close EVERY day was
    // flagged as a catastrophic drop — a day half over has half its revenue.
    const judged = detectAnomalies(series, { recentDays: 1 });
    expect(judged.anomalies).toHaveLength(1);

    const excluded = detectAnomalies(series, { recentDays: 1, today: day(31) });
    expect(excluded.anomalies).toEqual([]);
    expect(excluded.todayExcluded).toBe(true);
  });

  test('today still appears in the series for charting', () => {
    const r = detectAnomalies(series, { recentDays: 1, today: day(31) });
    expect(r.series).toHaveLength(31);
  });
});

describe('the revenue_anomaly rule', () => {
  const rules = engine.DEFAULT_RULES
    .filter((r) => r.ruleType === 'revenue_anomaly')
    .map((r, i) => ({
      id: `anom-${i}`,
      rule_type: r.ruleType,
      condition: r.condition,
      severity: r.severity,
      message_template: r.messageTemplate,
      enabled: true,
    }));

  const report = (over = {}) => ({
    hasBaseline: true,
    baselineDays: 20,
    anomalies: [{
      date: '2026-07-20',
      revenue: 4000,
      normal: 10000,
      pctFromNormal: -60,
      score: -5,
      direction: 'drop',
      ...over,
    }],
  });

  test('raises an action for a significant drop', () => {
    const [c] = evaluateRevenueAnomaly(rules, { anomalies: report() });
    expect(c.ruleType).toBe('revenue_anomaly');
    expect(c.title).toMatch(/60% below normal/);
    expect(c.description).toMatch(/median of the last 20 trading days/);
  });

  test('a spike raises nothing — there is nothing to do about a good day', () => {
    expect(evaluateRevenueAnomaly(rules, {
      anomalies: report({ direction: 'spike', pctFromNormal: 80 }),
    })).toEqual([]);
  });

  test('a shallow drop stays below the threshold', () => {
    expect(evaluateRevenueAnomaly(rules, {
      anomalies: report({ pctFromNormal: -10 }),
    })).toEqual([]);
  });

  test('a day at less than half of normal escalates', () => {
    const [c] = evaluateRevenueAnomaly(rules, { anomalies: report({ pctFromNormal: -60 }) });
    expect(c.priority).toBe('high');
  });

  test('a moderate drop keeps the catalogue severity', () => {
    const [c] = evaluateRevenueAnomaly(rules, { anomalies: report({ pctFromNormal: -30 }) });
    expect(c.priority).toBe('medium');
  });

  test('one alert per day, however many passes see it', () => {
    const [a] = evaluateRevenueAnomaly(rules, { anomalies: report() });
    const [b] = evaluateRevenueAnomaly(rules, { anomalies: report() });
    expect(a.dedupeKey).toBe(b.dedupeKey);
  });

  test('nothing is raised without a baseline', () => {
    expect(evaluateRevenueAnomaly(rules, {
      anomalies: { hasBaseline: false, anomalies: [] },
    })).toEqual([]);
    expect(evaluateRevenueAnomaly(rules, {})).toEqual([]);
  });
});
