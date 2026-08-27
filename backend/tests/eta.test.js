/*
 * Pure-function tests for the ETA engine. No DB — these exercise the math that
 * drives every wait estimate, so the edge cases (bill requested, no orders yet,
 * floor, extra-chair fit, table reuse on a busy floor) are pinned down.
 */
const {
  computeAvgTableTime,
  buildWeightFn,
  estimateTableFreeIn,
  assignQueue,
  effectiveWeights,
} = require('../src/eta/eta.service');
const { DEFAULT_AVG_TABLE_MINUTES } = require('../src/eta/eta.weights');

const MIN = 60000;

describe('computeAvgTableTime', () => {
  it('falls back to the global default with no history', () => {
    expect(computeAvgTableTime(null)).toBe(DEFAULT_AVG_TABLE_MINUTES);
    expect(computeAvgTableTime({ n: 0, sum: 0 })).toBe(DEFAULT_AVG_TABLE_MINUTES);
  });

  it('blends the running mean toward the default (K=8)', () => {
    // n=8 sessions averaging 60 -> (8*60 + 8*45) / 16 = 52.5
    expect(computeAvgTableTime({ n: 8, sum: 480 })).toBeCloseTo(52.5, 5);
  });
});

describe('buildWeightFn', () => {
  it('uses the seed when there is no data and no override', () => {
    const w = buildWeightFn({}, {});
    expect(w('Main Course')).toBe(35);
    expect(w('Desserts')).toBe(20);
    expect(w('Anything Else')).toBe(25); // default seed
  });

  it('honours a manual override above learned/seed', () => {
    const w = buildWeightFn({ Mains: { n: 100, sum: 100 * 80 } }, { Mains: 50 });
    expect(w('Mains')).toBe(50);
  });

  it('blends learned toward seed', () => {
    // Mains: n=4 avg=40, seed=35 -> (4*40 + 8*35)/12 = 36.666…
    const w = buildWeightFn({ Mains: { n: 4, sum: 160 } }, {});
    expect(w('Mains')).toBeCloseTo(36.6667, 3);
  });
});

describe('estimateTableFreeIn', () => {
  const weightFn = buildWeightFn({}, {});
  const base = { avgTableTime: 45, buffer: 7 };

  it('collapses to a short wrap-up once the bill is requested', () => {
    const now = Date.now();
    const r = estimateTableFreeIn(
      { table_id: 't1', number: 1, seats: 4, started_at: new Date(now - 30 * MIN).toISOString(), requested_bill_at: new Date(now - 2 * MIN).toISOString(), categories: ['Starters', 'Main Course'] },
      { weightFn, ...base, now },
    );
    expect(r.basis).toBe('bill_requested');
    expect(r.freeInMinutes).toBe(5 + 7); // WRAP_UP + buffer
    expect(r.calculating).toBe(false);
  });

  it('falls back to avg and flags "calculating" for a just-seated, no-order table', () => {
    const now = Date.now();
    const r = estimateTableFreeIn(
      { table_id: 't2', number: 2, seats: 2, started_at: new Date(now - 1 * MIN).toISOString(), requested_bill_at: null, categories: [] },
      { weightFn, ...base, now },
    );
    expect(r.basis).toBe('avg_fallback');
    expect(r.calculating).toBe(true);
    expect(r.freeInMinutes).toBe(Math.round(45 - 1 + 7)); // 51
  });

  it('uses summed category weights minus elapsed', () => {
    const now = Date.now();
    // Starters(15)+Mains(35)=50; max(45,50)=50; elapsed 20 -> 30; +buffer 7 = 37
    const r = estimateTableFreeIn(
      { table_id: 't3', number: 3, seats: 4, started_at: new Date(now - 20 * MIN).toISOString(), requested_bill_at: null, categories: ['Starters', 'Main Course'] },
      { weightFn, ...base, now },
    );
    expect(r.basis).toBe('category_weights');
    expect(r.freeInMinutes).toBe(37);
    expect(r.calculating).toBe(false);
  });

  it('floors the remaining so an overdue table never shows ~0', () => {
    const now = Date.now();
    const r = estimateTableFreeIn(
      { table_id: 't4', number: 4, seats: 4, started_at: new Date(now - 300 * MIN).toISOString(), requested_bill_at: null, categories: ['Main Course'] },
      { weightFn, ...base, now },
    );
    expect(r.freeInMinutes).toBe(2 + 7); // MIN_FLOOR + buffer
  });
});

describe('assignQueue', () => {
  const tables = [
    { tableId: 'A', seats: 4, freeInMinutes: 10 },
    { tableId: 'B', seats: 4, freeInMinutes: 20 },
  ];

  it('stacks the 3rd party onto the soonest table + one turnover', () => {
    const parties = [
      { partyId: 'p1', partySize: 2 },
      { partyId: 'p2', partySize: 2 },
      { partyId: 'p3', partySize: 2 },
    ];
    const out = assignQueue(tables, parties, { avgTableTime: 45 });
    expect(out.map((o) => o.waitMinutes)).toEqual([10, 20, 55]); // 10, 20, 10+45
    expect(out[2].tableId).toBe('A');
  });

  it('routes the head of the queue to whichever table frees first', () => {
    const t = [
      { tableId: 'A', seats: 4, freeInMinutes: 20 },
      { tableId: 'B', seats: 4, freeInMinutes: 5 },
    ];
    const out = assignQueue(t, [{ partyId: 'p1', partySize: 2 }], { avgTableTime: 45 });
    expect(out[0].tableId).toBe('B');
    expect(out[0].waitMinutes).toBe(5);
  });

  it('only seats an oversized party via extra chair when both opt-in and setting allow', () => {
    const t = [{ tableId: 'A', seats: 2, freeInMinutes: 0 }];
    const party = [{ partyId: 'p1', partySize: 3, extraChair: true }];

    const allowed = assignQueue(t, party, { avgTableTime: 45, allowExtraChair: true });
    expect(allowed[0].tableId).toBe('A'); // 2 >= 3-1

    const disallowed = assignQueue(t, party, { avgTableTime: 45, allowExtraChair: false });
    expect(disallowed[0].tableId).toBeNull();
    expect(disallowed[0].waitMinutes).toBeNull();
  });
});

describe('effectiveWeights', () => {
  it('reports seed, learned, blended, override and effective per category', () => {
    const rows = effectiveWeights(
      { 'Main Course': { n: 4, sum: 160 } },
      { Drinks: '8' },
    );
    const mains = rows.find((r) => r.category === 'Main Course');
    expect(mains).toMatchObject({ seed: 35, samples: 4, learnedAvg: 40, override: null });
    expect(mains.effective).toBeCloseTo(36.7, 1);

    const drinks = rows.find((r) => r.category === 'Drinks');
    expect(drinks).toMatchObject({ seed: 10, samples: 0, learnedAvg: null, override: 8, effective: 8 });
  });
});
