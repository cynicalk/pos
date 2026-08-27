/*
 * Tier 0 forecasting — the baseline, the item mix, and the prep explosion.
 *
 * These pin the refusals more than the arithmetic. The maths is a median and a
 * ratio; what matters is that the model declines to answer when it should, that
 * a closed kitchen is never read as a day of no demand, that a dish selling
 * three on a Saturday never becomes "0.6 a day", and that an interval is only
 * ever offered when it was measured.
 *
 * Source: docs/FORECASTING.md §§III.3–III.6, VI.1, VI.3.
 */

const baseline = require('../src/modules/forecast/baseline');
const mix = require('../src/modules/forecast/item-mix');
const prep = require('../src/modules/forecast/prep');

const { forecastDay, backtest, weightedMape, classifySeries } = baseline;

/** Consecutive days from a Monday, so weekday indices are predictable. */
const MONDAY = '2026-06-01'; // a Monday
const dayN = (n) => {
  const d = new Date(Date.UTC(2026, 5, 1 + n));
  return d.toISOString().slice(0, 10);
};

/** A steady series with weekday shape: weekends heavier. */
const WEEKEND = new Set([0, 6]);
const buildSeries = (days, { level = 100, items = null } = {}) =>
  Array.from({ length: days }, (_, i) => {
    const date = dayN(i);
    const dow = baseline.dayOfWeek(date);
    const value = level * (WEEKEND.has(dow) ? 1.4 : 1) + ((i % 5) - 2);
    return { date, orders: Math.round(value / 5), value, items: items ? items(i, date) : {} };
  });

describe('classifySeries — the Croston routing (§III.5)', () => {
  test('a dish selling every day is smooth', () => {
    const r = classifySeries(Array.from({ length: 40 }, () => 10 + (Math.random() < 0.5 ? 1 : -1)));
    expect(r.klass).toBe('smooth');
    expect(r.forecastable).toBe(true);
  });

  test('three on a Saturday and nothing else is intermittent, not "0.6 a day"', () => {
    // The exact case the source document uses to argue against averaging.
    const series = Array.from({ length: 35 }, (_, i) => (i % 7 === 5 ? 3 : 0));
    const r = classifySeries(series);
    expect(r.adi).toBeGreaterThanOrEqual(baseline.ADI_CUT);
    expect(r.forecastable).toBe(false);
    expect(['intermittent', 'lumpy']).toContain(r.klass);
  });

  test('rare and wildly variable is lumpy', () => {
    const series = Array.from({ length: 35 }, (_, i) => (i % 9 === 0 ? [1, 40, 2, 30][i % 4] : 0));
    expect(classifySeries(series).klass).toBe('lumpy');
  });

  test('one sale in the whole window is not classified at all', () => {
    const r = classifySeries([0, 0, 0, 5, 0, 0]);
    expect(r.klass).toBe('no signal');
    expect(r.forecastable).toBe(false);
  });
});

describe('forecastDay — refusing to answer', () => {
  test('below the minimum trading days it returns null and says why', () => {
    const r = forecastDay(buildSeries(20), dayN(21));
    expect(r.point).toBeNull();
    expect(r.reason).toBe('not_enough_history');
    expect(r.requiredDays).toBe(baseline.MIN_TRADING_DAYS);
    expect(r.tradingDays).toBe(20);
  });

  test('an empty history refuses rather than throwing', () => {
    expect(forecastDay([], dayN(1)).point).toBeNull();
  });
});

describe('forecastDay — a closed kitchen is not zero demand (§III.7)', () => {
  const withClosures = () => {
    const s = buildSeries(70);
    // Two full closures — a deep clean and a public holiday.
    for (const i of [30, 45]) { s[i] = { ...s[i], orders: 0, value: 0, items: {} }; }
    return s;
  };

  test('closed days are excluded from the level, not averaged into it', () => {
    const withOut = forecastDay(buildSeries(70), dayN(71));
    const withClosed = forecastDay(withClosures(), dayN(71));
    // If closures were averaged in, the level would drop noticeably. It must not.
    expect(withClosed.point).toBeCloseTo(withOut.point, 5);
    expect(withClosed.closedDaysExcluded).toBe(2);
  });

  test('they do not count towards the history requirement either', () => {
    const s = buildSeries(30).map((d, i) => (i < 5 ? { ...d, orders: 0, value: 0 } : d));
    const r = forecastDay(s, dayN(31));
    expect(r.tradingDays).toBe(25);
    expect(r.reason).toBe('not_enough_history');
  });
});

describe('forecastDay — weekday shape', () => {
  test('a Saturday forecasts above a Tuesday on the same history', () => {
    const series = buildSeries(84);
    const saturday = forecastDay(series, '2026-08-29'); // Saturday
    const tuesday = forecastDay(series, '2026-08-25');  // Tuesday
    expect(saturday.point).toBeGreaterThan(tuesday.point);
    expect(saturday.weekdayFactor).toBeGreaterThan(1);
  });

  test('a weekday with too few samples falls back to the flat level and says so', () => {
    // Only three weeks, so each weekday has three samples — right at the edge.
    const thin = buildSeries(30).slice(0, 30);
    const r = forecastDay(thin, dayN(31));
    // Whatever it decides, it must never claim a factor it did not compute.
    if (r.weekdayIsFlat) {
      expect(r.weekdayFactor).toBeNull();
      expect(r.point).toBeCloseTo(r.level, 5);
    } else {
      expect(r.weekdaySamples).toBeGreaterThanOrEqual(baseline.MIN_SAMPLES_PER_WEEKDAY);
    }
  });

  test('thin history is flagged even when it forecasts', () => {
    const r = forecastDay(buildSeries(35), dayN(36));
    expect(r.point).not.toBeNull();
    expect(r.historyIsThin).toBe(true);
    expect(forecastDay(buildSeries(70), dayN(71)).historyIsThin).toBe(false);
  });
});

describe('forecastDay — the band is measured, never assumed (§III.6)', () => {
  test('a long steady history produces a band around the point', () => {
    const r = forecastDay(buildSeries(90), dayN(91));
    expect(r.lo).not.toBeNull();
    expect(r.hi).not.toBeNull();
    expect(r.lo).toBeLessThanOrEqual(r.point);
    expect(r.hi).toBeGreaterThanOrEqual(r.point);
    expect(['same_weekday_residuals', 'all_weekday_residuals']).toContain(r.bandBasis);
  });

  test('too few residuals means no band at all, not a default one', () => {
    // Just past the history floor, so the backtest has almost nothing to score.
    const r = forecastDay(buildSeries(31), dayN(32));
    if (r.residualCount < baseline.MIN_RESIDUALS_FOR_BAND) {
      expect(r.lo).toBeNull();
      expect(r.hi).toBeNull();
      expect(r.bandBasis).toBe('none');
    }
  });

  test('a noisier restaurant gets a wider band than a steady one', () => {
    const steady = buildSeries(90);
    const noisy = buildSeries(90).map((d, i) => ({ ...d, value: d.value * (1 + ((i * 7) % 11 - 5) / 10) }));
    const a = forecastDay(steady, dayN(91));
    const b = forecastDay(noisy, dayN(91));
    const width = (r) => (r.hi - r.lo) / r.point;
    expect(width(b)).toBeGreaterThan(width(a));
  });
});

describe('backtest — rolling origin (§VI.1)', () => {
  test('every residual is scored on days the model had not seen', () => {
    const series = buildSeries(90);
    const residuals = backtest(series);
    expect(residuals.length).toBeGreaterThan(0);
    // Nothing is scored before the model is allowed to speak.
    const earliest = series[baseline.MIN_TRADING_DAYS].date;
    expect(residuals.every((r) => r.date >= earliest)).toBe(true);
  });

  test('closed days are not scored — there is no error to measure', () => {
    const series = buildSeries(90);
    series[60] = { ...series[60], orders: 0, value: 0 };
    expect(backtest(series).some((r) => r.date === series[60].date)).toBe(false);
  });

  test('weighted MAPE is null with nothing to measure, never zero', () => {
    // Zero would read as a perfect forecast rather than as an absent one.
    expect(weightedMape([])).toBeNull();
    expect(weightedMape(backtest(buildSeries(90)))).toBeGreaterThan(0);
  });
});

describe('item mix (§III.3)', () => {
  const menu = (i, date) => {
    const dow = baseline.dayOfWeek(date);
    return {
      'Butter Chicken': 12 + (i % 3),
      'Veg Biryani': 8 + (i % 2),
      // Sells only on Saturdays — must be routed out, never given a share.
      'Mutton Special': dow === 6 ? 3 : 0,
    };
  };

  test('shares over the forecastable dishes sum to one', () => {
    const r = mix.buildShares(buildSeries(60, { items: menu }), '2026-08-25');
    const total = r.shares.reduce((s, x) => s + x.share, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  test('the Saturday-only dish is routed out with the day it actually sells', () => {
    const r = mix.buildShares(buildSeries(60, { items: menu }), '2026-08-25');
    expect(r.shares.some((s) => s.name === 'Mutton Special')).toBe(false);
    const odd = r.irregular.find((x) => x.name === 'Mutton Special');
    expect(odd).toBeDefined();
    expect(odd.busiestWeekday).toBe(6);
    expect(odd.typicalWhenItSells).toBe(3);
  });

  test('coverage says what fraction of volume the mix speaks for', () => {
    const r = mix.buildShares(buildSeries(60, { items: menu }), '2026-08-25');
    expect(r.covered).toBeGreaterThan(0);
    expect(r.covered).toBeLessThanOrEqual(1);
  });

  test('the total forecast band travels down to each dish', () => {
    const series = buildSeries(90, { items: menu });
    const total = forecastDay(series, '2026-08-29');
    const items = mix.itemForecast(total, mix.buildShares(series, '2026-08-29'));
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.lo).toBeLessThanOrEqual(it.qty + 1e-9);
      expect(it.hi).toBeGreaterThanOrEqual(it.qty - 1e-9);
    }
  });

  test('the mix claims only the volume it covers, never the whole day', () => {
    // Shares normalise to one across the forecastable dishes, so applying them
    // to the full day would hand the smooth dishes the intermittent ones'
    // portions as well — over-prepping everything on the sheet, silently, in
    // the direction of waste.
    const series = buildSeries(90, { items: menu });
    const total = forecastDay(series, '2026-08-25');
    const shares = mix.buildShares(series, '2026-08-25');
    const items = mix.itemForecast(total, shares);

    expect(shares.covered).toBeLessThan(1);   // the Saturday dish is routed out
    const allocated = items.reduce((s, i) => s + i.qty, 0);
    expect(allocated).toBeLessThan(total.point);
    expect(allocated).toBeCloseTo(total.point * shares.covered, 6);
  });

  test('no total forecast means no item forecast — not a mix of zeros', () => {
    const refused = forecastDay(buildSeries(10), dayN(11));
    expect(mix.itemForecast(refused, { shares: [{ name: 'x', share: 1 }] })).toEqual([]);
  });
});

describe('prep explosion (§III.3)', () => {
  const recipes = new Map([
    ['Butter Chicken', {
      yield: 1,
      lines: [
        { ingredientId: 'chk', name: 'Chicken', unit: 'kg', quantity: 0.18, unitCost: 380 },
        { ingredientId: 'crm', name: 'Cream', unit: 'L', quantity: 0.05, unitCost: 190 },
      ],
    }],
    ['Veg Biryani', {
      yield: 2, // a recipe written for two portions
      lines: [{ ingredientId: 'rice', name: 'Basmati Rice', unit: 'kg', quantity: 0.4, unitCost: 120 }],
    }],
  ]);

  const items = [
    { name: 'Butter Chicken', qty: 50, lo: 40, hi: 62 },
    { name: 'Veg Biryani', qty: 30, lo: 24, hi: 37 },
    { name: 'Uncosted Dish', qty: 20, lo: 16, hi: 25 },
  ];

  test('quantities are arithmetic straight through the recipe', () => {
    const r = prep.explode(items, recipes);
    const chicken = r.ingredients.find((i) => i.ingredientId === 'chk');
    expect(chicken.quantity).toBeCloseTo(50 * 0.18, 6); // 9 kg
    expect(chicken.cost).toBeCloseTo(9 * 380, 6);
  });

  test('a recipe yielding two portions is divided by its yield', () => {
    const r = prep.explode(items, recipes);
    const rice = r.ingredients.find((i) => i.ingredientId === 'rice');
    expect(rice.quantity).toBeCloseTo(30 * (0.4 / 2), 6); // 6 kg, not 12
  });

  test('a dish with no recipe surfaces instead of vanishing', () => {
    // Silently dropping it would under-order the prep sheet with no sign.
    const r = prep.explode(items, recipes);
    expect(r.uncosted.map((u) => u.name)).toContain('Uncosted Dish');
    expect(r.coveragePct).toBeCloseTo((80 / 100) * 100, 6);
  });

  test('each ingredient says which dishes drove it', () => {
    const r = prep.explode(items, recipes);
    const chicken = r.ingredients.find((i) => i.ingredientId === 'chk');
    expect(chicken.fromDishes[0].dish).toBe('Butter Chicken');
  });

  test('the band explodes with the quantity', () => {
    const r = prep.explode(items, recipes);
    const chicken = r.ingredients.find((i) => i.ingredientId === 'chk');
    expect(chicken.lo).toBeCloseTo(40 * 0.18, 6);
    expect(chicken.hi).toBeCloseTo(62 * 0.18, 6);
  });

  test('nothing to explode gives an empty sheet, not a zero-cost one', () => {
    const r = prep.explode([], recipes);
    expect(r.ingredients).toEqual([]);
    expect(r.coveragePct).toBe(0);
  });
});
