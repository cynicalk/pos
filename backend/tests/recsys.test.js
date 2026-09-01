const { buildRecoFunnel, MIN_SESSIONS } = require('../src/modules/recsys/funnel');
const { buildRecoMargin, MIN_RECO_ADDS } = require('../src/modules/recsys/margin');
const { buildAcceptancePriors, MIN_IMPRESSIONS } = require('../src/modules/recsys/prior');

/**
 * Phase 0 recsys is measurement, not a model. These pin the two things the
 * measurement must get right: the abstention floors (a rate over a handful of
 * sessions is noise, so it is withheld, not shown as a confident percent), and
 * the reco→margin join (reco-driven adds land in the right menu-engineering
 * quadrant, uncosted dishes are counted not guessed).
 */

describe('buildRecoFunnel', () => {
  test('below the session floor it abstains on rates but still shows counts', () => {
    const f = buildRecoFunnel({
      sessions: 5, sessions_saw_recos: 4, sessions_added: 3,
      sessions_added_reco: 2, sessions_ordered: 1, dish_adds: 6, dish_adds_reco: 4,
    });
    expect(f.enoughData).toBe(false);
    expect(f.acceptanceRate).toBeNull();
    expect(f.conversionRate).toBeNull();
    expect(f.learning).toEqual({ minSessions: MIN_SESSIONS, have: 4 });
    // counts survive so the operator sees the raw funnel forming
    expect(f.stages.find((s) => s.key === 'ordered').count).toBe(1);
  });

  test('above the floor it reports acceptance and conversion', () => {
    const f = buildRecoFunnel({
      sessions: 50, sessions_saw_recos: 40, sessions_added: 30,
      sessions_added_reco: 20, sessions_ordered: 10,
      dish_adds: 80, dish_adds_reco: 40,
      rejects_refine: 5, rejects_capped: 2,
    });
    expect(f.enoughData).toBe(true);
    expect(f.acceptanceRate).toBe(50);   // 40 / 80
    expect(f.conversionRate).toBe(25);   // 10 / 40 saw-recos
    expect(f.rejections.total).toBe(7);
  });

  test('each stage rate is of the previous stage, not the whole', () => {
    const f = buildRecoFunnel({
      sessions: 100, sessions_saw_recos: 40, sessions_added: 20,
      sessions_added_reco: 10, sessions_ordered: 5,
      dish_adds: 30, dish_adds_reco: 12,
    });
    const added = f.stages.find((s) => s.key === 'added_any');
    expect(added.ofPrev).toBe(50); // 20 of 40 who saw picks
  });

  test('no data at all does not divide by zero', () => {
    const f = buildRecoFunnel({});
    expect(f.enoughData).toBe(false);
    expect(f.stages[0].count).toBe(0);
    expect(f.acceptanceRate).toBeNull();
  });

  test('week-over-week acceptance delta needs both windows above the floor', () => {
    const cur = { sessions_saw_recos: 40, dish_adds: 80, dish_adds_reco: 40 }; // 50%
    const fatPrior = { sessions_saw_recos: 40, dish_adds: 100, dish_adds_reco: 66 }; // 66%
    const thinPrior = { sessions_saw_recos: 5, dish_adds: 10, dish_adds_reco: 8 };

    const withPrior = buildRecoFunnel(cur, fatPrior);
    expect(withPrior.priorAcceptanceRate).toBe(66);
    expect(withPrior.acceptanceDelta).toBe(-16); // 50 - 66

    // A thin prior window yields no delta rather than a noisy one.
    const withThin = buildRecoFunnel(cur, thinPrior);
    expect(withThin.acceptanceDelta).toBeNull();
    // No prior at all → null, not zero.
    expect(buildRecoFunnel(cur).acceptanceDelta).toBeNull();
  });
});

describe('buildRecoMargin', () => {
  const matrix = {
    stars: [{ id: 'a', name: 'Butter Chicken', profitMargin: 70 }],
    puzzles: [{ id: 'b', name: 'Lamb Shank', profitMargin: 65 }],
    plowhorses: [{ id: 'c', name: 'Naan', profitMargin: 20 }],
    dogs: [{ id: 'd', name: 'Side Salad', profitMargin: 15 }],
  };

  test('reco adds are summed into the right quadrant', () => {
    const stats = [
      { menuItemId: 'a', dishName: 'Butter Chicken', recoAdds: 10, recoRemoves: 0 },
      { menuItemId: 'c', dishName: 'Naan', recoAdds: 8, recoRemoves: 0 },
    ];
    const r = buildRecoMargin(stats, matrix);
    expect(r.byClass.stars).toBe(10);
    expect(r.byClass.plowhorses).toBe(8);
    expect(r.classifiedAdds).toBe(18);
  });

  test('net of removes, and a dish that nets to zero is not "pushed"', () => {
    const stats = [
      { menuItemId: 'a', dishName: 'Butter Chicken', recoAdds: 5, recoRemoves: 5 },
      { menuItemId: 'b', dishName: 'Lamb Shank', recoAdds: 20, recoRemoves: 4 },
    ];
    const r = buildRecoMargin(stats, matrix);
    expect(r.dishes.find((d) => d.menuItemId === 'a')).toBeUndefined();
    expect(r.byClass.puzzles).toBe(16);
  });

  test('an uncosted / unclassified dish is counted, never guessed a margin', () => {
    const stats = [
      { menuItemId: 'a', dishName: 'Butter Chicken', recoAdds: 20, recoRemoves: 0 },
      { menuItemId: 'z', dishName: 'New Special', recoAdds: 9, recoRemoves: 0 },
    ];
    const r = buildRecoMargin(stats, matrix);
    expect(r.uncostedAdds).toBe(9);
    const z = r.dishes.find((d) => d.menuItemId === 'z');
    expect(z.class).toBeNull();
    expect(z.profitMargin).toBeNull();
  });

  test('verdict is margin_leak when picks skew to low-margin quadrants', () => {
    const stats = [
      { menuItemId: 'a', dishName: 'Butter Chicken', recoAdds: 5, recoRemoves: 0 }, // high
      { menuItemId: 'c', dishName: 'Naan', recoAdds: 12, recoRemoves: 0 },          // low
      { menuItemId: 'd', dishName: 'Side Salad', recoAdds: 10, recoRemoves: 0 },    // low
    ];
    const r = buildRecoMargin(stats, matrix);
    expect(r.enoughData).toBe(true);
    expect(r.verdict).toBe('margin_leak'); // 5 high of 27 → ~19% high-margin share
  });

  test('below the reco-add floor it abstains on the verdict', () => {
    const stats = [{ menuItemId: 'a', dishName: 'Butter Chicken', recoAdds: 3, recoRemoves: 0 }];
    const r = buildRecoMargin(stats, matrix);
    expect(r.enoughData).toBe(false);
    expect(r.verdict).toBeNull();
    expect(r.learning).toEqual({ minRecoAdds: MIN_RECO_ADDS, have: 3 });
  });

  test('impression → add conversion is per dish, and null where nothing was shown', () => {
    const stats = [
      { menuItemId: 'a', dishName: 'Butter Chicken', recoAdds: 6, recoRemoves: 0 },
      { menuItemId: 'b', dishName: 'Lamb Shank', recoAdds: 3, recoRemoves: 0 },
    ];
    const impressions = [{ menuItemId: 'a', impressions: 24 }]; // b never logged as shown
    const r = buildRecoMargin(stats, matrix, impressions);
    expect(r.hasImpressions).toBe(true);
    const a = r.dishes.find((d) => d.menuItemId === 'a');
    const b = r.dishes.find((d) => d.menuItemId === 'b');
    expect(a.conversion).toBe(25);      // 6 adds / 24 shown
    expect(b.conversion).toBeNull();    // shown count unknown → no fake rate
  });

  test('conversion is capped at 100% and hasImpressions is false without any', () => {
    const stats = [{ menuItemId: 'a', dishName: 'Butter Chicken', recoAdds: 30, recoRemoves: 0 }];
    // A dish added more times than it was shown (multi-qty adds) never reads >100%.
    const r = buildRecoMargin(stats, matrix, [{ menuItemId: 'a', impressions: 10 }]);
    expect(r.dishes[0].conversion).toBe(100);
    const noImp = buildRecoMargin(stats, matrix, []);
    expect(noImp.hasImpressions).toBe(false);
  });
});

describe('buildAcceptancePriors (learned prior, Wilson + recency)', () => {
  const A = (id, imp, adds) => ({ menuItemId: id, impressions: imp, adds, recentImpressions: 0, recentAdds: 0 });

  test('dishes accepted above the menu average get a positive lift, below get negative', () => {
    const priors = buildAcceptancePriors([A('a', 100, 50), A('b', 100, 10), A('c', 100, 30)]);
    expect(priors.get('a')).toBeGreaterThan(0);   // well above the (Wilson) mean
    expect(priors.get('b')).toBeLessThan(0);       // well below
    expect(Math.abs(priors.get('c'))).toBeLessThan(Math.abs(priors.get('a'))); // near the middle
  });

  test('Wilson keeps a lucky thin sample from rocketing up the ranking', () => {
    // Same 75% point estimate, but 3/4 is far less certain than 150/200; its lower
    // bound is much smaller, so it does NOT out-rank the high-volume dish.
    const priors = buildAcceptancePriors([
      A('lucky', 6, 5),     // ~83% point, but tiny n
      A('proven', 200, 150), // 75% on real volume
      A('meh', 100, 20),
    ]);
    expect(priors.get('proven')).toBeGreaterThan(priors.get('lucky'));
  });

  test('a dish shown fewer than the floor is not judged at all (model unchanged)', () => {
    const priors = buildAcceptancePriors([
      A('a', 40, 20), A('b', 40, 10), A('c', 40, 30),
      A('thin', MIN_IMPRESSIONS - 1, 4),
    ]);
    expect(priors.has('thin')).toBe(false);
  });

  test('recent adds weigh more than old ones', () => {
    // Two dishes with identical totals, but one earned its adds recently.
    const priors = buildAcceptancePriors([
      { menuItemId: 'recent', impressions: 40, adds: 20, recentImpressions: 20, recentAdds: 18 },
      { menuItemId: 'stale', impressions: 40, adds: 20, recentImpressions: 20, recentAdds: 2 },
      { menuItemId: 'base', impressions: 40, adds: 12, recentImpressions: 6, recentAdds: 6 },
    ]);
    expect(priors.get('recent')).toBeGreaterThan(priors.get('stale'));
  });

  test('too few judged dishes to form a baseline → nothing learned yet', () => {
    const priors = buildAcceptancePriors([A('a', 40, 20), A('b', 40, 10)]);
    expect(priors.size).toBe(0);
  });

  test('lift is clamped to [-1, 1]', () => {
    const priors = buildAcceptancePriors([A('a', 40, 40), A('b', 40, 1), A('c', 40, 1)]);
    for (const v of priors.values()) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('recsys stats', () => {
  const { wilsonLowerBound, twoProportionZ } = require('../src/modules/recsys/stats');

  test('Wilson lower bound is below the point estimate and rises with n', () => {
    const low = wilsonLowerBound(3, 4);   // 75% on 4 trials
    const high = wilsonLowerBound(150, 200); // 75% on 200 trials
    expect(low).toBeLessThan(0.75);
    expect(high).toBeGreaterThan(low);
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  test('two-proportion z flags a real move and shrugs off a thin one', () => {
    expect(twoProportionZ(40, 200, 90, 200).significant).toBe(true);   // 20% vs 45%, big n
    expect(twoProportionZ(4, 10, 6, 10).significant).toBe(false);       // same gap, tiny n
    expect(twoProportionZ(5, 0, 5, 10).significant).toBe(false);        // no trials one side
  });
});

const { buildRevenueAttribution, buildSegments, buildRefineStats } = require('../src/modules/recsys/analytics');

describe('buildRevenueAttribution', () => {
  test('attributes revenue by reco share and computes AOV lift when both sides are big enough', () => {
    const r = buildRevenueAttribution({
      orders: 40, total_revenue: 40000, reco_revenue: 18000,
      reco_orders: 25, reco_order_revenue: 30000,   // AOV 1200
      nonreco_orders: 15, nonreco_order_revenue: 12000, // AOV 800
    });
    expect(r.recoRevenue).toBe(18000);
    expect(r.recoRevenuePct).toBe(45);
    expect(r.aovReco).toBe(1200);
    expect(r.aovNonReco).toBe(800);
    expect(r.aovLift).toBe(400);
    expect(r.enoughForAov).toBe(true);
  });

  test('abstains on AOV lift when one side is too thin', () => {
    const r = buildRevenueAttribution({
      orders: 12, total_revenue: 10000, reco_revenue: 6000,
      reco_orders: 11, reco_order_revenue: 9000,
      nonreco_orders: 1, nonreco_order_revenue: 1000, // too few
    });
    expect(r.aovLift).toBeNull();
    expect(r.enoughForAov).toBe(false);
    expect(r.recoRevenuePct).toBe(60); // attribution still reported
  });
});

describe('buildSegments', () => {
  test('each segment abstains below its own session floor; sorted by size', () => {
    const segs = buildSegments([
      { segment: 'walkin', saw: 40, adds: 60, adds_reco: 36, ordered: 20 },
      { segment: 'reservation', saw: 5, adds: 8, adds_reco: 6, ordered: 3 },
    ]);
    expect(segs[0].segment).toBe('walkin');
    expect(segs[0].acceptancePct).toBe(60);   // 36/60
    expect(segs[0].conversionPct).toBe(50);    // 20/40
    expect(segs[1].enoughData).toBe(false);    // reservation too thin
    expect(segs[1].acceptancePct).toBeNull();
  });
});

describe('buildRefineStats', () => {
  test('flags weak first picks when refiners convert much worse', () => {
    const r = buildRefineStats({ sessions: 100, refined_sessions: 40, refined_ordered: 8, unrefined_ordered: 42 });
    expect(r.refineRate).toBe(40);
    expect(r.refinedConversionPct).toBe(20);   // 8/40
    expect(r.unrefinedConversionPct).toBe(70);  // 42/60
    expect(r.verdict).toBe('first_picks_weak');
  });

  test('abstains on verdict when a side is too thin', () => {
    const r = buildRefineStats({ sessions: 20, refined_sessions: 3, refined_ordered: 1, unrefined_ordered: 10 });
    expect(r.refinedConversionPct).toBeNull();
    expect(r.verdict).toBeNull();
  });
});

describe('buildExperiment (A/B holdout)', () => {
  const { buildExperiment } = require('../src/modules/recsys/analytics');
  test('reports control vs treatment lift and significance when both arms are sized', () => {
    const e = buildExperiment([
      { segment: 'treatment', saw: 200, adds: 300, adds_reco: 210, ordered: 110 },
      { segment: 'control',   saw: 60,  adds: 90,  adds_reco: 45,  ordered: 24 },
    ]);
    expect(e.enoughData).toBe(true);
    expect(e.treatment.acceptancePct).toBe(70);
    expect(e.control.acceptancePct).toBe(50);
    expect(e.acceptanceLift).toBe(20);
    expect(e.significant).toBe(true);
  });

  test('abstains until both arms clear the floor', () => {
    const e = buildExperiment([
      { segment: 'treatment', saw: 200, adds: 300, adds_reco: 210, ordered: 110 },
      { segment: 'control',   saw: 5,   adds: 6,   adds_reco: 3,   ordered: 2 },
    ]);
    expect(e.enoughData).toBe(false);
    expect(e.acceptanceLift).toBeNull();
  });
});

describe('buildConcentration (cannibalization proxy)', () => {
  const { buildConcentration } = require('../src/modules/recsys/analytics');
  test('spread adds give a low HHI; concentrated adds give a high one', () => {
    const spread = buildConcentration([
      { recoAdds: 10 }, { recoAdds: 10 }, { recoAdds: 10 }, { recoAdds: 10 }, { recoAdds: 10 },
    ]);
    expect(spread.enoughData).toBe(true);
    expect(spread.hhi).toBeCloseTo(0.2, 2);   // 5 equal dishes → 1/5
    expect(spread.topSharePct).toBe(20);

    const concentrated = buildConcentration([{ recoAdds: 45 }, { recoAdds: 3 }, { recoAdds: 2 }]);
    expect(concentrated.hhi).toBeGreaterThan(spread.hhi);
    expect(concentrated.topSharePct).toBeGreaterThan(80);
  });

  test('abstains below the add floor', () => {
    expect(buildConcentration([{ recoAdds: 3 }]).enoughData).toBe(false);
  });
});

describe('learned prior — position de-bias', () => {
  const { buildAcceptancePriors } = require('../src/modules/recsys/prior');
  test('an add from a deep slot outweighs the same acceptance from the top slot', () => {
    // Two dishes, identical impressions/adds — one always shown at the top, one
    // always deep. The deep one should earn a higher lift (its adds are harder-won).
    const priors = buildAcceptancePriors([
      { menuItemId: 'top',  impressions: 60, adds: 24, recentImpressions: 0, recentAdds: 0, avgRank: 1 },
      { menuItemId: 'deep', impressions: 60, adds: 24, recentImpressions: 0, recentAdds: 0, avgRank: 5 },
      { menuItemId: 'mid',  impressions: 60, adds: 18, recentImpressions: 0, recentAdds: 0, avgRank: 3 },
    ]);
    expect(priors.get('deep')).toBeGreaterThan(priors.get('top'));
  });

  test('no rank history → neutral (does not change the ordering by acceptance alone)', () => {
    const priors = buildAcceptancePriors([
      { menuItemId: 'a', impressions: 60, adds: 30, recentImpressions: 0, recentAdds: 0 },
      { menuItemId: 'b', impressions: 60, adds: 10, recentImpressions: 0, recentAdds: 0 },
      { menuItemId: 'c', impressions: 60, adds: 20, recentImpressions: 0, recentAdds: 0 },
    ]);
    expect(priors.get('a')).toBeGreaterThan(priors.get('b'));
  });
});
