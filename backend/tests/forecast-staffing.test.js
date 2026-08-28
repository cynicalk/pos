const staffing = require('../src/modules/forecast/staffing');

/**
 * Staffing turns forecast covers into a roster and a labour cost. The one thing
 * worth guarding hardest is the refusal: below enough history it must decline to
 * state a productivity figure rather than reach for an industry number.
 */
describe('staffing.learnProductivity', () => {
  const day = (covers, labourHours) => ({ covers, labourHours });

  test('learns covers per labour-hour once there is enough history', () => {
    // 20 days, each 40 covers over 20 labour-hours → 2 covers/hour.
    const history = Array.from({ length: 20 }, () => day(40, 20));
    const p = staffing.learnProductivity(history);
    expect(p.enough).toBe(true);
    expect(p.coversPerLabourHour).toBeCloseTo(2);
    expect(p.sampleDays).toBe(20);
  });

  test('declines below the minimum history rather than guessing', () => {
    const history = Array.from({ length: 5 }, () => day(40, 20));
    const p = staffing.learnProductivity(history);
    expect(p.enough).toBe(false);
    expect(p.coversPerLabourHour).toBeNull();
  });

  test('ignores days with no labour or no covers', () => {
    const history = [
      ...Array.from({ length: 14 }, () => day(30, 15)), // ratio 2
      day(0, 10), day(30, 0), // both unusable
    ];
    const p = staffing.learnProductivity(history);
    expect(p.enough).toBe(true);
    expect(p.sampleDays).toBe(14);
    expect(p.coversPerLabourHour).toBeCloseTo(2);
  });
});

describe('staffing.planDay', () => {
  const enough = { coversPerLabourHour: 2, sampleDays: 20, enough: true };

  test('covers ÷ productivity gives the hours, split by the role mix', () => {
    const plan = staffing.planDay(80, enough, {
      roleMix: [{ role: 'staff', share: 0.5 }, { role: 'kitchen', share: 0.5 }],
      shiftHours: 8,
    });
    expect(plan.suggestedHours).toBeCloseTo(40);      // 80 / 2
    expect(plan.suggestedHeadcount).toBe(5);          // 40 / 8
    expect(plan.byRole.map((r) => r.hours)).toEqual([20, 20]);
  });

  test('returns nothing when productivity was never learned', () => {
    const plan = staffing.planDay(80, { enough: false, coversPerLabourHour: null }, {});
    expect(plan.suggestedHours).toBeNull();
    expect(plan.suggestedHeadcount).toBeNull();
  });
});

describe('staffing.laborPctBand & verdict', () => {
  const hist = (pct) => ({ revenue: 1000, labourCost: pct * 10 }); // labourCost/revenue*100 = pct

  test('a day inside the band reads healthy, outside reads lean/heavy', () => {
    // 20 days spread 15..34% → band roughly 15–34, median ~24.
    const history = Array.from({ length: 20 }, (_, i) => hist(15 + i));
    const band = staffing.laborPctBand(history);
    expect(band.median).not.toBeNull();
    expect(staffing.verdict(band.median, band)).toBe('healthy');
    expect(staffing.verdict(band.high + 10, band)).toBe('heavy');
    expect(staffing.verdict(band.low - 10, band)).toBe('lean');
  });

  test('no band below the minimum history → unknown verdict', () => {
    const band = staffing.laborPctBand(Array.from({ length: 5 }, () => hist(20)));
    expect(band.median).toBeNull();
    expect(staffing.verdict(20, band)).toBe('unknown');
  });
});
