const { planCompaction, tailChars, DEFAULTS } = require('../src/modules/ai/compaction');

/**
 * Compaction is what keeps a long chat from crowding the model's small context.
 * These pin the "too many rounds" trigger and the slice boundaries: a short chat
 * is never folded, folding fires on either budget, and the most recent turns are
 * always kept verbatim so the immediate context a reply needs survives.
 */

const msgs = (n, len = 10) =>
  Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(len) }));

describe('planCompaction', () => {
  test('a short conversation is never folded', () => {
    const tail = msgs(DEFAULTS.keepTail); // exactly keepTail — not "more than"
    const plan = planCompaction(tail);
    expect(plan.shouldFold).toBe(false);
    expect(plan.keptTail).toBe(tail);
    expect(plan.toFold).toEqual([]);
  });

  test('folds once the message budget is exceeded, keeping the last keepTail verbatim', () => {
    const tail = msgs(DEFAULTS.msgBudget + 1, 5); // over msgBudget, tiny chars
    const plan = planCompaction(tail);
    expect(plan.shouldFold).toBe(true);
    expect(plan.keptTail).toHaveLength(DEFAULTS.keepTail);
    expect(plan.toFold).toHaveLength(tail.length - DEFAULTS.keepTail);
    // The split is contiguous and complete — nothing dropped, nothing duplicated.
    expect([...plan.toFold, ...plan.keptTail]).toEqual(tail);
    // The kept tail is the MOST RECENT messages.
    expect(plan.keptTail).toEqual(tail.slice(tail.length - DEFAULTS.keepTail));
  });

  test('folds on the char budget even when the message count is small', () => {
    const tail = msgs(DEFAULTS.keepTail + 1, DEFAULTS.charBudget); // few messages, huge chars
    expect(tailChars(tail)).toBeGreaterThan(DEFAULTS.charBudget);
    const plan = planCompaction(tail);
    expect(plan.shouldFold).toBe(true);
    expect(plan.keptTail).toHaveLength(DEFAULTS.keepTail);
  });

  test('under both budgets but longer than keepTail is still not folded', () => {
    const tail = msgs(DEFAULTS.keepTail + 2, 5); // keepTail+2 messages, well under both budgets
    expect(planCompaction(tail).shouldFold).toBe(false);
  });

  test('thresholds are overridable', () => {
    const tail = msgs(4, 5);
    expect(planCompaction(tail, { keepTail: 2, msgBudget: 3 }).shouldFold).toBe(true);
    expect(planCompaction(tail, { keepTail: 2, msgBudget: 3 }).keptTail).toHaveLength(2);
  });

  test('an empty tail is a no-op', () => {
    const plan = planCompaction([]);
    expect(plan.shouldFold).toBe(false);
    expect(plan.toFold).toEqual([]);
  });
});
