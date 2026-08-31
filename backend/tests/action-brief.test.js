const { buildActionSignals, buildActionMessages, fallbackActionBrief } = require('../src/modules/rules/action-brief');

/**
 * The narrated action centre only sequences the already-ranked findings into a
 * plan — it must keep their order, never invent one, never put a number on an
 * unquantified action, and present the total as "at least" (only the priced ones).
 */

const NOW = Date.parse('2026-08-31T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3.6e6).toISOString();

const ranked = [
  { title: 'Recover ₹781 from the swiggy settlement', priority: 'medium', rule_type: 'payout_variance', created_at: hoursAgo(5), opportunity: { amount: 781.09 } },
  { title: 'Coupon WELCOME50 is giving away 52%',       priority: 'high',   rule_type: 'coupon_loss',     created_at: hoursAgo(20), opportunity: { amount: 400 } },
  { title: '3 guests flagged hygiene',                  priority: 'high',   rule_type: 'review_theme',    created_at: hoursAgo(2), opportunity: { amount: null } },
  { title: 'Rating dipped to 3.8',                      priority: 'medium', rule_type: 'rating_drop',     created_at: hoursAgo(48), opportunity: { amount: null } },
];

describe('buildActionSignals', () => {
  test('summarises priority mix and totals only the priced actions', () => {
    const s = buildActionSignals(ranked, NOW);
    expect(s.totalOpen).toBe(4);
    expect(s.byPriority).toEqual({ high: 2, medium: 2, low: 0 });
    expect(s.quantifiedTotal).toBe(1181.09); // 781.09 + 400, the null ones excluded
    expect(s.quantifiedCount).toBe(2);
    expect(s.top[0].title).toContain('swiggy');   // order preserved
    expect(s.top[2].amount).toBeNull();           // unquantified stays null
    expect(s.top[0].ageHours).toBe(5);
  });
});

describe('fallbackActionBrief', () => {
  test('leads with the count, then the top action, then the "at least" total', () => {
    const t = fallbackActionBrief(buildActionSignals(ranked, NOW));
    expect(t).toContain('4 open actions');
    expect(t).toContain('2 high priority');
    expect(t).toContain('Start with "Recover ₹781 from the swiggy settlement" — ₹781 at stake');
    expect(t).toMatch(/At least ₹1,181 is recoverable/);
  });

  test('an unquantified top action gets no invented number', () => {
    const t = fallbackActionBrief(buildActionSignals([ranked[2]], NOW));
    expect(t).toContain('Start with "3 guests flagged hygiene".');
    expect(t).not.toMatch(/at stake|₹/); // no amount and no quantified total
  });

  test('empty list says it is clear', () => {
    expect(fallbackActionBrief(buildActionSignals([], NOW))).toMatch(/clear/i);
  });
});

describe('buildActionMessages', () => {
  test('binds the model to the given order and the "at least" framing', () => {
    const msgs = buildActionMessages(buildActionSignals(ranked, NOW));
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toMatch(/keep their order/i);
    expect(msgs[0].content).toMatch(/do not re-rank or invent/i);
    expect(msgs[0].content).toMatch(/null amount means the impact is not quantified/i);
    expect(JSON.parse(msgs[1].content).quantifiedTotal).toBe(1181.09);
  });
});
