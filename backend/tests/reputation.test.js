/*
 * Phase 6 pure-logic tests (MERGE_PLAN.md).
 *
 * These cover the decisions that are easy to get quietly wrong: which theme a
 * mixed review belongs to, what a rating average means when there are no
 * reviews, when a rank movement is real, and what a repeat rate is allowed to
 * claim when the POS can only see a fraction of the guests.
 */

const themes = require('../src/modules/reputation/themes');
const { summarizeReviews, buildActionQueue } = require('../src/modules/reputation/summary');
const reply = require('../src/modules/reputation/reply');
const { buildTrackedQueries, buildBenchmark, MAX_COMPARABLE_GAP_DAYS } =
  require('../src/modules/reputation/rankings');
const { buildGuestMetrics, LAPSED_AFTER_DAYS, MIN_GUESTS_FOR_RATE } =
  require('../src/modules/guests/repeat');
const { buildChurnPredictions } = require('../src/modules/guests/churn');
const { evaluateRankDrop } = require('../src/modules/rules/rank-drop');
const engine = require('../src/modules/rules/engine');

const DAY = 24 * 60 * 60 * 1000;

describe('review theme classification', () => {
  test('picks the theme with the most distinct mentions, not the first match', () => {
    // The source returned the first list match, which sent this to hygiene's
    // neighbour purely by list order. Service is mentioned three ways.
    const text = 'Food was a bit oily but the waiter was rude, the staff ignored us, terrible service';
    expect(themes.classifyByKeywords(text)).toBe('service');
  });

  test('hygiene wins a genuine tie over food quality', () => {
    expect(themes.classifyByKeywords('dirty table, bland food')).toBe('hygiene');
  });

  test('no comment classifies as other, never guessed from the rating', () => {
    expect(themes.classifyByKeywords('')).toBe('other');
    expect(themes.classifyByKeywords(null)).toBe('other');
    expect(themes.classifyByKeywords('   ')).toBe('other');
  });

  test('repeating one word is one complaint, not three', () => {
    // "price price price" must not beat two distinct service words.
    expect(themes.classifyByKeywords('price price price rude staff')).toBe('service');
  });

  test('sentiment comes from the rating', () => {
    expect(themes.sentimentFromRating(5)).toBe('positive');
    expect(themes.sentimentFromRating(4)).toBe('positive');
    expect(themes.sentimentFromRating(3)).toBe('neutral');
    expect(themes.sentimentFromRating(1)).toBe('negative');
    expect(themes.sentimentFromRating(null)).toBeNull();
  });

  test('an unknown theme from a model is coerced to other', () => {
    expect(themes.normaliseTheme('parking')).toBe('other');
    expect(themes.normaliseTheme('hygiene')).toBe('hygiene');
  });
});

describe('review summary', () => {
  const review = (over, opts = {}) => ({
    id: opts.id || `r${over}${Math.random()}`,
    overall_rating: over,
    food_rating: opts.food ?? null,
    service_rating: opts.service ?? null,
    comment: opts.comment ?? null,
    theme: opts.theme ?? null,
    sentiment: opts.sentiment ?? null,
  });

  test('no reviews yields a null average, not zero', () => {
    const s = summarizeReviews([]);
    expect(s.total).toBe(0);
    expect(s.avgRating).toBeNull();
    expect(s.themes).toEqual([]);
  });

  test('unclassified reviews still count in the sentiment split and are reported', () => {
    const s = summarizeReviews([
      review(5, { sentiment: 'positive', theme: 'service' }),
      review(1), // arrived a moment ago, classifier has not run
    ]);
    expect(s.total).toBe(2);
    expect(s.positive).toBe(1);
    expect(s.negative).toBe(1);
    expect(s.unclassified).toBe(1);
  });

  test('food and service averages ignore reviews that left them blank', () => {
    const s = summarizeReviews([
      review(5, { food: 5, sentiment: 'positive' }),
      review(3, { sentiment: 'neutral' }),
    ]);
    expect(s.avgFood).toBe(5);
    expect(s.avgService).toBeNull();
  });

  test('worst example is kept per theme with its review id', () => {
    const s = summarizeReviews([
      review(2, { theme: 'hygiene', sentiment: 'negative', comment: 'not great', id: 'a' }),
      review(1, { theme: 'hygiene', sentiment: 'negative', comment: 'a hair in the curry', id: 'b' }),
    ]);
    const hygiene = s.themes.find((t) => t.theme === 'hygiene');
    expect(hygiene.worstExample).toBe('a hair in the curry');
    expect(hygiene.worstReviewId).toBe('b');
    expect(hygiene.negativeCount).toBe(2);
  });
});

describe('review action queue', () => {
  const negative = (theme, n) => Array.from({ length: n }, (_, i) => ({
    id: `${theme}-${i}`,
    overall_rating: 2,
    theme,
    sentiment: 'negative',
    comment: 'bad',
  }));

  test('ranks by how often something goes wrong, not by the worst single score', () => {
    const rows = [
      ...negative('service', 4),
      { id: 'h1', overall_rating: 1, theme: 'hygiene', sentiment: 'negative', comment: 'awful' },
      { id: 'h2', overall_rating: 5, theme: 'hygiene', sentiment: 'positive', comment: 'spotless' },
    ];
    const queue = buildActionQueue(summarizeReviews(rows));
    expect(queue[0].theme).toBe('service');
    expect(queue[0].negativeCount).toBe(4);
  });

  test('a single negative review does not become a pattern to act on', () => {
    const queue = buildActionQueue(summarizeReviews([
      { id: 'x', overall_rating: 1, theme: 'hygiene', sentiment: 'negative', comment: 'bad' },
    ]));
    expect(queue).toEqual([]);
  });

  test('one complaint inside a busy theme is still just one complaint', () => {
    // The live-output defect: the gate was on the theme's TOTAL reviews, so a
    // lone negative among thirteen happy ones was ranked as something to fix.
    const rows = [
      { id: 'bad', overall_rating: 2, theme: 'service', sentiment: 'negative', comment: 'rude' },
      ...Array.from({ length: 13 }, (_, i) => ({
        id: `good-${i}`, overall_rating: 5, theme: 'service', sentiment: 'positive', comment: 'lovely',
      })),
    ];
    expect(buildActionQueue(summarizeReviews(rows))).toEqual([]);
  });

  test('two complaints in the same theme is a pattern', () => {
    const rows = [
      { id: 'b1', overall_rating: 2, theme: 'service', sentiment: 'negative', comment: 'rude' },
      { id: 'b2', overall_rating: 1, theme: 'service', sentiment: 'negative', comment: 'ignored' },
      { id: 'g1', overall_rating: 5, theme: 'service', sentiment: 'positive', comment: 'lovely' },
    ];
    const queue = buildActionQueue(summarizeReviews(rows));
    expect(queue).toHaveLength(1);
    expect(queue[0].negativeCount).toBe(2);
  });

  test('themes with no negative reviews stay out of the queue', () => {
    const queue = buildActionQueue(summarizeReviews([
      { id: 'p1', overall_rating: 5, theme: 'service', sentiment: 'positive', comment: 'great' },
      { id: 'p2', overall_rating: 5, theme: 'service', sentiment: 'positive', comment: 'great' },
    ]));
    expect(queue).toEqual([]);
  });

  test('negative share is reported alongside the count', () => {
    const queue = buildActionQueue(summarizeReviews([
      ...negative('service', 3),
      { id: 'ok', overall_rating: 5, theme: 'service', sentiment: 'positive', comment: 'fine' },
    ]));
    expect(queue[0].negativeSharePct).toBe(75);
  });

  test('every queued theme carries an action, never a restated symptom', () => {
    const queue = buildActionQueue(summarizeReviews(negative('value_for_money', 2)));
    expect(queue[0].suggestedAction).toEqual(expect.stringMatching(/portion/i));
  });
});

describe('reply drafting', () => {
  test('a good rating gets a thank-you, not an apology', () => {
    const text = reply.templateReply({
      rating: 5, theme: 'service', guestName: 'Priya Nair', restaurantName: 'Spice Bowl',
    });
    expect(text).toMatch(/thank you/i);
    expect(text).not.toMatch(/sorry/i);
    expect(text).toMatch(/Hi Priya/);
  });

  test('a bad rating apologises for the specific thing', () => {
    const text = reply.templateReply({
      rating: 1, theme: 'hygiene', guestName: null, restaurantName: 'Spice Bowl',
    });
    expect(text).toMatch(/kitchen/i);
    expect(text).toMatch(/^Hello,/);
  });

  test('the model prompt forbids compensation and invention', () => {
    const prompt = reply.buildReplyPrompt({ restaurantName: 'Spice Bowl' });
    expect(prompt).toMatch(/refunds/i);
    expect(prompt).toMatch(/discounts/i);
    expect(prompt).toMatch(/invent/i);
  });

  test('a rating-only review is described as such to the model, not left blank', () => {
    const ctx = reply.buildReplyContext({ rating: 2, theme: 'other', comment: null });
    expect(ctx).toMatch(/rating only, no comment/);
  });
});

describe('search rank tracking', () => {
  const now = Date.now();
  const reading = (query, position, daysAgo) => ({
    platform: 'swiggy',
    query,
    position,
    total_results: null,
    recorded_at: new Date(now - daysAgo * DAY),
  });

  test('a lower position number is an improvement', () => {
    const [q] = buildTrackedQueries([reading('biryani', 9, 5), reading('biryani', 4, 0)]);
    expect(q.change).toBe(5);
    expect(q.latestPosition).toBe(4);
  });

  test('a higher position number is a drop', () => {
    const [q] = buildTrackedQueries([reading('biryani', 4, 5), reading('biryani', 9, 0)]);
    expect(q.change).toBe(-5);
  });

  test('input order cannot change the answer', () => {
    const rows = [reading('biryani', 4, 0), reading('biryani', 9, 5)];
    const [q] = buildTrackedQueries(rows);
    expect(q.latestPosition).toBe(4);
    expect(q.change).toBe(5);
  });

  test('readings too far apart are not called a change', () => {
    const [q] = buildTrackedQueries([
      reading('biryani', 4, MAX_COMPARABLE_GAP_DAYS + 10),
      reading('biryani', 12, 0),
    ]);
    expect(q.change).toBeNull();
    expect(q.stale).toBe(true);
    expect(q.gapDays).toBe(MAX_COMPARABLE_GAP_DAYS + 10);
  });

  test('a single reading has nothing to compare against', () => {
    const [q] = buildTrackedQueries([reading('biryani', 4, 0)]);
    expect(q.change).toBeNull();
    expect(q.gapDays).toBeNull();
    expect(q.stale).toBe(false);
    expect(q.readings).toBe(1);
  });

  test('the same query on two platforms is two tracked queries', () => {
    const rows = [
      reading('biryani', 4, 0),
      { ...reading('biryani', 1, 0), platform: 'zomato' },
    ];
    expect(buildTrackedQueries(rows)).toHaveLength(2);
  });

  test('worst position is listed first', () => {
    const rows = [reading('biryani', 2, 0), reading('thali', 14, 0)];
    expect(buildTrackedQueries(rows)[0].query).toBe('thali');
  });
});

describe('rating benchmark', () => {
  const competitor = (name, rating, platform = 'swiggy') => ({
    competitor_name: name, platform, rating, recorded_at: new Date(),
  });

  test('delta is null when we have no reviews of our own', () => {
    const b = buildBenchmark({ ownRating: null, ownReviewCount: 0, competitorRows: [competitor('Rival', 4.2)] });
    expect(b.ownRating).toBeNull();
    expect(b.competitors[0].delta).toBeNull();
    expect(b.ahead).toBeNull();
  });

  test('only the newest reading per competitor and platform is used', () => {
    // Rows arrive newest-first, as the repository orders them.
    const b = buildBenchmark({
      ownRating: 4.5,
      ownReviewCount: 20,
      competitorRows: [competitor('Rival', 4.0), competitor('rival ', 3.0)],
    });
    expect(b.competitors).toHaveLength(1);
    expect(b.competitors[0].rating).toBe(4);
    expect(b.competitors[0].delta).toBe(0.5);
  });

  test('the same competitor on two platforms is counted twice', () => {
    const b = buildBenchmark({
      ownRating: 4.5,
      ownReviewCount: 20,
      competitorRows: [competitor('Rival', 4.0, 'swiggy'), competitor('Rival', 3.5, 'zomato')],
    });
    expect(b.competitors).toHaveLength(2);
    expect(b.ahead).toBe(2);
  });
});

describe('guest repeat rate and winback', () => {
  const now = Date.now();
  const guest = (id, visits, daysAgo, spend) => ({
    customer_id: id,
    phone: `9${id}`,
    name: `Guest ${id}`,
    visits,
    first_visit: new Date(now - (daysAgo + 60) * DAY),
    last_visit: new Date(now - daysAgo * DAY),
    total_spend: spend,
  });

  const many = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

  test('repeat rate is withheld below the guest floor', () => {
    const m = buildGuestMetrics([guest(1, 2, 1, 500), guest(2, 1, 1, 300)], {}, now);
    expect(m.uniqueGuests).toBe(2);
    expect(m.repeatGuests).toBe(1);
    expect(m.repeatRatePct).toBeNull();
    expect(m.minGuestsForRate).toBe(MIN_GUESTS_FOR_RATE);
  });

  test('repeat rate is reported once there are enough guests', () => {
    const rows = many(MIN_GUESTS_FOR_RATE, (i) => guest(i, i < 5 ? 2 : 1, 1, 100));
    const m = buildGuestMetrics(rows, {}, now);
    expect(m.repeatRatePct).toBe(50);
  });

  test('coverage states how much of the floor these numbers describe', () => {
    const m = buildGuestMetrics([guest(1, 2, 1, 500)], {
      identifiedOrders: 30, totalOrders: 200, windowDays: 90,
    }, now);
    expect(m.coverage.pct).toBe(15);
    expect(m.coverage.identifiedOrders).toBe(30);
    expect(m.coverage.windowDays).toBe(90);
  });

  test('coverage is null rather than zero when there were no orders at all', () => {
    const m = buildGuestMetrics([], { identifiedOrders: 0, totalOrders: 0 }, now);
    expect(m.coverage.pct).toBeNull();
  });

  test('lapsed is measured from the last visit', () => {
    const m = buildGuestMetrics([
      guest(1, 3, LAPSED_AFTER_DAYS + 5, 900),
      guest(2, 2, 2, 400),
    ], {}, now);
    expect(m.lapsedCount).toBe(1);
    expect(m.lapsedGuests[0].customerId).toBe(1);
    expect(m.lapsedGuests[0].daysSince).toBe(LAPSED_AFTER_DAYS + 5);
  });

  test('winback list is ordered by what they used to spend', () => {
    const m = buildGuestMetrics([
      guest(1, 2, 40, 200),
      guest(2, 5, 45, 5000),
    ], {}, now);
    expect(m.lapsedGuests.map((g) => g.customerId)).toEqual([2, 1]);
    expect(m.lapsedHistoricSpend).toBe(5200);
  });

  test('average spend is per visit, not per order row', () => {
    const m = buildGuestMetrics([guest(1, 4, 1, 1000)], {}, now);
    expect(m.recentGuests[0].avgSpend).toBe(250);
  });

  test('churn records preserve explicit WhatsApp consent for campaign routing', () => {
    const day = 24 * 60 * 60 * 1000;
    const { guests } = buildChurnPredictions([{
      customerId: 'c1',
      phone: '+919999999999',
      name: 'Asha',
      whatsappOptIn: true,
      orderDates: [
        new Date(now - 30 * day),
        new Date(now - 20 * day),
        new Date(now - 10 * day),
      ],
      totalSpend: 900,
    }], now);

    expect(guests[0].whatsappOptIn).toBe(true);
  });
});

describe('rank_drop rule', () => {
  const rules = engine.DEFAULT_RULES
    .filter((r) => r.ruleType === 'rank_drop')
    .map((r, i) => ({
      id: `rank-${i}`,
      rule_type: r.ruleType,
      condition: r.condition,
      severity: r.severity,
      message_template: r.messageTemplate,
      enabled: true,
    }));

  const tracked = (over) => ({
    platform: 'swiggy',
    query: 'biryani',
    latestPosition: 8,
    previousPosition: 3,
    change: -5,
    gapDays: 4,
    stale: false,
    ...over,
  });

  test('fires on a drop past the threshold', () => {
    const [c] = evaluateRankDrop(rules, { trackedQueries: [tracked()] });
    expect(c.ruleType).toBe('rank_drop');
    expect(c.title).toMatch(/fell 5 places/);
    expect(c.description).toMatch(/measured 4 days apart/);
  });

  test('two readings on the same day are not described as a gap of no time', () => {
    // "measured 0 days apart" — the same live-output defect as the page's
    // "over 0d". A same-day drop is real and still worth raising.
    const [c] = evaluateRankDrop(rules, { trackedQueries: [tracked({ gapDays: 0 })] });
    expect(c.description).toMatch(/measured the same day/);
    expect(c.description).not.toMatch(/0 days/);
  });

  test('ignores an improvement', () => {
    expect(evaluateRankDrop(rules, { trackedQueries: [tracked({ change: 5 })] })).toEqual([]);
  });

  test('ignores a one-place wobble', () => {
    expect(evaluateRankDrop(rules, {
      trackedQueries: [tracked({ change: -1, latestPosition: 4 })],
    })).toEqual([]);
  });

  test('never fires on readings too far apart to compare', () => {
    // buildTrackedQueries nulls `change` for a wide gap; the rule must not
    // reconstruct the drop from the two positions.
    expect(evaluateRankDrop(rules, {
      trackedQueries: [tracked({ change: null, gapDays: 90, stale: true })],
    })).toEqual([]);
  });

  test('falling off the first page escalates', () => {
    const [c] = evaluateRankDrop(rules, {
      trackedQueries: [tracked({ latestPosition: 14, previousPosition: 9, change: -5 })],
    });
    expect(c.priority).toBe('high');
  });

  test('sliding within the first page keeps the catalogue severity', () => {
    const [c] = evaluateRankDrop(rules, {
      trackedQueries: [tracked({ latestPosition: 8, change: -5 })],
    });
    expect(c.priority).toBe('medium');
  });

  test('the dedupe key is per landed position, so one alert per new low', () => {
    const [a] = evaluateRankDrop(rules, { trackedQueries: [tracked()] });
    const [b] = evaluateRankDrop(rules, { trackedQueries: [tracked()] });
    expect(a.dedupeKey).toBe(b.dedupeKey);
    const [c] = evaluateRankDrop(rules, { trackedQueries: [tracked({ latestPosition: 11 })] });
    expect(c.dedupeKey).not.toBe(a.dedupeKey);
  });

  test('does nothing when nothing has been recorded', () => {
    expect(evaluateRankDrop(rules, { trackedQueries: [] })).toEqual([]);
    expect(evaluateRankDrop(rules, {})).toEqual([]);
  });
});
