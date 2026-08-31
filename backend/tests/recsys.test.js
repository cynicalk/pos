const { buildRecoFunnel, MIN_SESSIONS } = require('../src/modules/recsys/funnel');
const { buildRecoMargin, MIN_RECO_ADDS } = require('../src/modules/recsys/margin');

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
});
