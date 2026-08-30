const promo = require('../src/modules/forecast/promo');
const baseline = require('../src/modules/forecast/baseline');

/**
 * Promo-aware forecasting rests on two claims: a day is flagged promo only when
 * a real share of its orders were discounted (not a couple of loyalty coupons),
 * and a flagged day is set aside from the baseline exactly as a closed day is —
 * excluded from the level and weekday factors, and reported.
 */
describe('detectPromoDays', () => {
  const days = [
    { date: '2026-08-01', orders: 40 }, // 8 redemptions → 20% share → promo
    { date: '2026-08-02', orders: 50 }, // 2 redemptions → below floor
    { date: '2026-08-03', orders: 100 }, // 5 redemptions → 5% share → ordinary
    { date: '2026-08-04', orders: 30 }, // 0 redemptions
  ];
  const redemptions = { '2026-08-01': 8, '2026-08-02': 2, '2026-08-03': 5 };

  test('flags only days with both the floor count and a material share', () => {
    const { promoDates, detail } = promo.detectPromoDays(days, redemptions);
    expect([...promoDates]).toEqual(['2026-08-01']);
    expect(detail[0]).toMatchObject({ date: '2026-08-01', redemptions: 8, orders: 40, share: 0.2 });
  });

  test('a busy day with a few coupons is ordinary loyalty, not a promo', () => {
    // 5 of 100 clears the count floor only if we set it low; with the default
    // floor of 3 it passes count but fails the 15% share — correctly not a promo.
    const { promoDates } = promo.detectPromoDays(days, redemptions);
    expect(promoDates.has('2026-08-03')).toBe(false);
  });

  test('thresholds are configurable', () => {
    const { promoDates } = promo.detectPromoDays(days, redemptions, { minRedemptions: 2, minShare: 0.03 });
    expect(promoDates.has('2026-08-02')).toBe(true); // 2/50 = 4%
    expect(promoDates.has('2026-08-03')).toBe(true); // 5/100 = 5%
  });
});

describe('flagPromoDays', () => {
  test('sets promo:true on matching days without mutating the input', () => {
    const series = [{ date: '2026-08-01', value: 1 }, { date: '2026-08-02', value: 2 }];
    const flagged = promo.flagPromoDays(series, new Set(['2026-08-01']));
    expect(flagged[0].promo).toBe(true);
    expect(flagged[1].promo).toBeUndefined();
    expect(series[0].promo).toBeUndefined(); // original untouched
  });
});

describe('baseline excludes promo days like closed days', () => {
  // 8 weeks of Mondays-only-ish flat series at 100, plus one promo spike.
  const mkSeries = (withPromoSpike) => {
    const out = [];
    const start = new Date(Date.UTC(2026, 4, 1));
    for (let i = 0; i < 60; i += 1) {
      const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
      out.push({ date: d, orders: 20, value: 100 });
    }
    if (withPromoSpike) {
      // Triple the most recent day and flag it promo.
      out[out.length - 1] = { ...out[out.length - 1], value: 300, promo: true };
    }
    return out;
  };

  test('a promo spike flagged does not inflate the level', () => {
    const target = '2026-07-05';
    const clean = baseline.forecastDay(mkSeries(false), target);
    const withPromo = baseline.forecastDay(mkSeries(true), target);
    // The flagged spike is excluded, so the level is unchanged from the clean run.
    expect(withPromo.point).toBeCloseTo(clean.point, 5);
    expect(withPromo.promoDaysExcluded).toBe(1);
    expect(clean.promoDaysExcluded).toBe(0);
  });
});
