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

describe('buildAcceptancePriors (learned prior)', () => {
  test('dishes accepted above the menu average get a positive lift, below get negative', () => {
    const priors = buildAcceptancePriors([
      { menuItemId: 'a', impressions: 40, adds: 20 }, // 50% acceptance
      { menuItemId: 'b', impressions: 40, adds: 4 },  // 10%
      { menuItemId: 'c', impressions: 40, adds: 12 }, // 30%  (mean = 30%)
    ]);
    expect(priors.get('a')).toBeGreaterThan(0);
    expect(priors.get('b')).toBeLessThan(0);
    expect(priors.get('c')).toBeCloseTo(0, 5); // at the mean → no nudge
  });

  test('a dish shown fewer than the floor is not judged at all (model unchanged)', () => {
    const priors = buildAcceptancePriors([
      { menuItemId: 'a', impressions: 40, adds: 20 },
      { menuItemId: 'b', impressions: 40, adds: 10 },
      { menuItemId: 'c', impressions: 40, adds: 30 },
      { menuItemId: 'thin', impressions: MIN_IMPRESSIONS - 1, adds: 5 },
    ]);
    expect(priors.has('thin')).toBe(false);
  });

  test('too few judged dishes to form a baseline → nothing learned yet', () => {
    const priors = buildAcceptancePriors([
      { menuItemId: 'a', impressions: 40, adds: 20 },
      { menuItemId: 'b', impressions: 40, adds: 10 },
    ]);
    expect(priors.size).toBe(0);
  });

  test('lift is clamped to [-1, 1] so one runaway dish cannot dominate', () => {
    const priors = buildAcceptancePriors([
      { menuItemId: 'a', impressions: 40, adds: 40 }, // 100%
      { menuItemId: 'b', impressions: 40, adds: 1 },
      { menuItemId: 'c', impressions: 40, adds: 1 },
    ]);
    for (const v of priors.values()) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
