const { figuresGrounded, allowedNumbers } = require('../src/ai/narrate');

/**
 * The numeric-fidelity guard is the strict prompt's "use only these figures" rule
 * enforced in code: a narration that quotes a rupee amount or percentage the
 * signals don't contain is rejected for the honest template. These pin that it
 * catches a fabricated figure, passes an honest one, and never trips on ordinary
 * prose.
 */

const messages = [
  { role: 'system', content: 'narrate these' },
  { role: 'user', content: JSON.stringify({
    sales: { revenue: 48200, anomaly: { pctFromNormal: 17.6 } },
    margin: { foodCostPct: 31.4 },
    waste: { totalCost: 3120 },
  }) },
];

describe('numeric-fidelity guard', () => {
  const allowed = allowedNumbers(messages);

  test('an honest narration that quotes the real figures passes', () => {
    const text = 'Yesterday took ₹48,200, up 17.6% on normal. Food cost is 31.4% and waste came to ₹3,120.';
    expect(figuresGrounded(text, allowed)).toBe(true);
  });

  test('a fabricated rupee figure is caught', () => {
    // ₹4,82,000 is a hallucinated 10x of the real ₹48,200.
    expect(figuresGrounded('Yesterday took ₹4,82,000.', allowed)).toBe(false);
  });

  test('a fabricated percentage is caught', () => {
    expect(figuresGrounded('Food cost is running at 62%.', allowed)).toBe(false);
  });

  test('ordinary prose with small counts never trips the guard', () => {
    expect(figuresGrounded('Two or three dishes lead the day; keep an eye on 4 tables.', allowed)).toBe(true);
  });

  test('rounding slack: a figure one rupee off a signal still passes', () => {
    expect(figuresGrounded('Waste came to ₹3,121.', allowed)).toBe(true);
  });

  test('a rate stored as a fraction is matched to its percentage form', () => {
    const msgs = [{ role: 'user', content: JSON.stringify({ recoShare: 0.45 }) }];
    expect(figuresGrounded('Picks drove 45% of the order.', allowedNumbers(msgs))).toBe(true);
  });
});
