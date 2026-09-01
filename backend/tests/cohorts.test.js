const { buildCohorts } = require('../src/modules/reputation/cohorts');

describe('buildCohorts', () => {
  test('retention is against the cohort own size; LTV is cumulative per guest', () => {
    const r = buildCohorts([
      { cohort: '2026-06', month_offset: 0, active_guests: 10, revenue: 10000 },
      { cohort: '2026-06', month_offset: 1, active_guests: 6,  revenue: 7200 },
      { cohort: '2026-06', month_offset: 2, active_guests: 4,  revenue: 5000 },
      { cohort: '2026-07', month_offset: 0, active_guests: 8,  revenue: 8800 },
    ]);
    const jun = r.cohorts.find((c) => c.cohort === '2026-06');
    expect(jun.size).toBe(10);
    expect(jun.months[1].retentionPct).toBe(60);           // 6 of 10
    expect(jun.months[0].cumulativeLtv).toBe(1000);         // 10000/10
    expect(jun.months[2].cumulativeLtv).toBe(2220);         // (10000+7200+5000)/10
    // July cohort has only had one month → one column, not zeros.
    expect(r.cohorts.find((c) => c.cohort === '2026-07').months).toHaveLength(1);
  });

  test('no guests → empty, not a fabricated cohort', () => {
    expect(buildCohorts([]).cohorts).toHaveLength(0);
  });
});
