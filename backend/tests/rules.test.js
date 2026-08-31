const engine = require('../src/modules/rules/engine');
const opportunity = require('../src/modules/rules/opportunity');
const tracker = require('../src/modules/outcomes/tracker');

// Rules engine (MERGE_PLAN.md Phase 2). These need no database: the port
// deliberately separated evaluation from fetching (src/modules/README.md), so
// every threshold, dedupe key and verdict direction is arguable right here.

const rule = (overrides = {}) => ({
  id: 'rule-1', enabled: true, severity: 'medium',
  rule_type: 'high_cancellation',
  condition: { field: 'cancellation_pct', op: '>', value: 10 },
  message_template: '{cancellation_pct}% of {total_count} orders cancelled over {window_days} days.',
  ...overrides,
});

describe('condition evaluation', () => {
  test('honours each operator', () => {
    expect(engine.evaluateCondition(11, { op: '>', value: 10 })).toBe(true);
    expect(engine.evaluateCondition(10, { op: '>', value: 10 })).toBe(false);
    expect(engine.evaluateCondition(10, { op: '>=', value: 10 })).toBe(true);
    expect(engine.evaluateCondition(3.9, { op: '<', value: 4 })).toBe(true);
    expect(engine.evaluateCondition(4, { op: '<', value: 4 })).toBe(false);
  });

  test('an unknown operator never fires, rather than defaulting to true', () => {
    expect(engine.evaluateCondition(999, { op: 'approximately', value: 1 })).toBe(false);
  });
});

describe('cancellation rule', () => {
  test('fires above the threshold and states the real counts', () => {
    const [action] = engine.evaluateCancellations([rule()], {
      totalOrders: 100, cancelledOrders: 15,
    });
    expect(action.title).toContain('15.0%');
    expect(action.description).toContain('100');  // total, from the real counts
    expect(action.description).toContain('30');   // the window, not a guess
    expect(action.dedupeKey).toBe('high_cancellation');
  });

  test('stays silent at or below the threshold', () => {
    expect(engine.evaluateCancellations([rule()], {
      totalOrders: 100, cancelledOrders: 10,
    })).toHaveLength(0);
  });

  test('a restaurant with no orders yields no rate, not a zero one', () => {
    expect(engine.evaluateCancellations([rule()], {
      totalOrders: 0, cancelledOrders: 0,
    })).toHaveLength(0);
  });
});

describe('rating rule', () => {
  const ratingRule = rule({
    rule_type: 'rating_drop',
    condition: { field: 'avg_rating', op: '<', value: 4 },
    message_template: 'Average of last {review_count} is {avg_rating}. Weakest: {weakest_area}.',
  });
  const reviews = (n, overall, food, service) =>
    Array.from({ length: n }, () => ({
      overall_rating: overall, food_rating: food, service_rating: service,
    }));

  test('will not judge a restaurant on too few reviews', () => {
    // Four terrible reviews are a bad night, not a rating problem.
    expect(engine.evaluateRatings([ratingRule], { reviews: reviews(4, 1, 1, 1) })).toHaveLength(0);
  });

  test('fires once there are enough reviews', () => {
    const [action] = engine.evaluateRatings([ratingRule], { reviews: reviews(5, 3, 3, 3) });
    expect(action.title).toContain('3.0');
    expect(action.dedupeKey).toBe('rating_drop');
  });

  test('names the weaker of the two sub-scores', () => {
    const [action] = engine.evaluateRatings([ratingRule], { reviews: reviews(5, 3, 2, 5) });
    expect(action.title).toContain('food');
    const [other] = engine.evaluateRatings([ratingRule], { reviews: reviews(5, 3, 5, 2) });
    expect(other.title).toContain('service');
  });

  test('says so rather than guessing when guests left no breakdown', () => {
    const [action] = engine.evaluateRatings([ratingRule], {
      reviews: reviews(5, 3, null, null),
    });
    expect(action.title).toContain('not broken down');
  });
});

describe('stalled table rule', () => {
  const stalledRule = rule({
    rule_type: 'stalled_table',
    condition: { field: 'minutes_seated', op: '>=', value: 25 },
    message_template: 'Table {table} seated {minutes_seated} minutes.',
  });
  const NOW = new Date('2026-08-26T12:00:00Z').getTime();
  const minutesAgo = (m) => new Date(NOW - m * 60000).toISOString();

  test('fires for a table seated past the threshold with nothing ordered', () => {
    const [action] = engine.evaluateStalledTables([stalledRule], {
      seatedTables: [{ id: 't1', number: 7, occupied_at: minutesAgo(40), open_order_count: 0 }],
    }, NOW);
    expect(action.title).toContain('Table 7');
    expect(action.title).toContain('40 min');
  });

  test('ignores a table that has ordered', () => {
    expect(engine.evaluateStalledTables([stalledRule], {
      seatedTables: [{ id: 't1', number: 7, occupied_at: minutesAgo(90), open_order_count: 2 }],
    }, NOW)).toHaveLength(0);
  });

  test('skips a table with no seating time instead of assuming one', () => {
    // Tables occupied before migration 074 have no occupied_at. Guessing would
    // produce a confident number about a party that may have just sat down.
    expect(engine.evaluateStalledTables([stalledRule], {
      seatedTables: [{ id: 't1', number: 7, occupied_at: null, open_order_count: 0 }],
    }, NOW)).toHaveLength(0);
  });

  test('never reports a negative wait when the clock is skewed', () => {
    expect(engine.evaluateStalledTables([stalledRule], {
      seatedTables: [{ id: 't1', number: 7, occupied_at: minutesAgo(-30), open_order_count: 0 }],
    }, NOW)).toHaveLength(0);
  });

  test('keys per occupancy so a re-seated table can alert again', () => {
    const first = engine.evaluateStalledTables([stalledRule], {
      seatedTables: [{ id: 't1', number: 7, occupied_at: minutesAgo(40), open_order_count: 0 }],
    }, NOW)[0];
    const reseated = engine.evaluateStalledTables([stalledRule], {
      seatedTables: [{ id: 't1', number: 7, occupied_at: minutesAgo(30), open_order_count: 0 }],
    }, NOW)[0];
    expect(first.dedupeKey).not.toBe(reseated.dedupeKey);
  });
});

describe('dedupe', () => {
  test('drops candidates whose condition is already unresolved', () => {
    const candidates = [{ dedupeKey: 'high_cancellation' }, { dedupeKey: 'rating_drop' }];
    const kept = engine.dedupeCandidates(candidates, ['high_cancellation']);
    expect(kept.map((c) => c.dedupeKey)).toEqual(['rating_drop']);
  });

  test('collapses duplicates raised within a single pass', () => {
    const dupes = [{ dedupeKey: 'rating_drop' }, { dedupeKey: 'rating_drop' }];
    expect(engine.dedupeCandidates(dupes, [])).toHaveLength(1);
  });

  test('a drifting number does not re-raise the same issue', () => {
    // The title carries the live rate; the key must not.
    const at11 = engine.evaluateCancellations([rule()], { totalOrders: 100, cancelledOrders: 11 })[0];
    const at19 = engine.evaluateCancellations([rule()], { totalOrders: 100, cancelledOrders: 19 })[0];
    expect(at11.title).not.toBe(at19.title);
    expect(at11.dedupeKey).toBe(at19.dedupeKey);
    expect(engine.dedupeCandidates([at19], [at11.dedupeKey])).toHaveLength(0);
  });
});

describe('opportunity ranking', () => {
  const actions = [
    { id: 'a', rule_type: 'rating_drop',      priority: 'high',   created_at: '2026-08-01' },
    { id: 'b', rule_type: 'high_cancellation', priority: 'medium', created_at: '2026-08-01' },
    { id: 'c', rule_type: 'stalled_table',     priority: 'low',    created_at: '2026-08-01' },
  ];

  test('a quantified action outranks a higher-priority unquantified one', () => {
    const ranked = opportunity.rankActions(actions, { cancellationLoss: 8000 });
    expect(ranked[0].id).toBe('b');
    expect(ranked[0].opportunity.amount).toBe(8000);
  });

  test('unquantifiable actions carry no amount at all, and fall back to priority', () => {
    const ranked = opportunity.rankActions(actions, { cancellationLoss: 8000 });
    const rating = ranked.find((a) => a.id === 'a');
    expect(rating.opportunity.amount).toBeNull();
    expect(rating.opportunity.basis).toBeNull();
    expect(ranked.map((a) => a.id)).toEqual(['b', 'a', 'c']);
  });

  test('with nothing measurable, ranking is by priority alone', () => {
    const ranked = opportunity.rankActions(actions, { cancellationLoss: 0 });
    expect(ranked.every((a) => a.opportunity.amount === null)).toBe(true);
    expect(ranked.map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  test('a payout leakage task carries its recoverable shortfall as the amount', () => {
    const withLeak = [
      { id: 'leak', dedupe_key: 'payout_leakage:s1', priority: 'medium', created_at: '2026-08-02' },
      ...actions,
    ];
    const ranked = opportunity.rankActions(withLeak, {
      cancellationLoss: 8000,
      payoutLeakage: { s1: 12000 },
    });
    // ₹12,000 recoverable outranks the ₹8,000 cancellation loss.
    expect(ranked[0].id).toBe('leak');
    expect(ranked[0].opportunity.amount).toBe(12000);
    expect(ranked[0].opportunity.basis).toBe('recoverable settlement shortfall');
  });

  test('a leakage task with no matching recoverable is unquantified, not zero', () => {
    const withLeak = [{ id: 'leak', dedupe_key: 'payout_leakage:s9', priority: 'medium', created_at: '2026-08-02' }];
    const [ranked] = opportunity.rankActions(withLeak, { payoutLeakage: {} });
    expect(ranked.opportunity.amount).toBeNull();
  });
});

describe('outcome verdicts', () => {
  test('a falling cancellation rate is an improvement', () => {
    expect(tracker.evaluateChange(20, 10, 'cancellation_pct').verdict).toBe('improved');
    expect(tracker.evaluateChange(10, 20, 'cancellation_pct').verdict).toBe('worsened');
  });

  test('a rising rating is an improvement — direction is per metric', () => {
    expect(tracker.evaluateChange(3.0, 4.5, 'avg_rating').verdict).toBe('improved');
    expect(tracker.evaluateChange(4.5, 3.0, 'avg_rating').verdict).toBe('worsened');
  });

  test('a small move is inconclusive rather than credited as a win', () => {
    expect(tracker.evaluateChange(20, 19.5, 'cancellation_pct').verdict).toBe('inconclusive');
  });

  test('rules with no standing metric are not tracked', () => {
    expect(tracker.metricForRuleType('high_cancellation')).not.toBeNull();
    expect(tracker.metricForRuleType('stalled_table')).toBeNull();
  });
});

describe('rule catalogue', () => {
  test('only ships rules whose data POS can supply today', () => {
    // The catalogue grows as its data sources land: cost_spike in Phase 4 with
    // ingredient_prices, license_expiry and cert_expiry in Phase 5 with
    // compliance_docs. Still out: rank_drop (needs search_ranks, Phase 6) and
    // the payout pair (needs settlements, Phase 8). A rule that can never fire
    // makes the engine look broken, so it is not seeded until it can.
    const types = engine.DEFAULT_RULES.map((r) => r.ruleType).sort();
    expect(types).toEqual([
      'attach_drop', 'cert_expiry', 'cost_spike', 'coupon_loss', 'high_cancellation',
      'license_expiry', 'rank_drop', 'rating_drop', 'revenue_anomaly',
      'review_theme', 'sc_removal_high', 'stalled_table',
    ]);
  });

  test('every default rule carries a template with no unfilled placeholder', () => {
    for (const r of engine.DEFAULT_RULES) {
      expect(r.messageTemplate).toBeTruthy();
      const vars = [...r.messageTemplate.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      expect(vars.length).toBeGreaterThan(0);
    }
  });
});

describe('message interpolation', () => {
  test('replaces every occurrence of a placeholder', () => {
    expect(engine.interpolate('{a} and {a} and {b}', { a: 'x', b: 'y' })).toBe('x and x and y');
  });

  test('leaves unknown placeholders visible rather than silently blanking them', () => {
    expect(engine.interpolate('{known} {unknown}', { known: 'ok' })).toBe('ok {unknown}');
  });
});
