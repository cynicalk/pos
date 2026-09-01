const { decideFeatureAction, MAX_ACTIVE } = require('../src/modules/autopilot/policy');

const promote = [
  { menuItemId: 'a', dishName: 'Iced Tea',  profitMargin: 96, featured: false },
  { menuItemId: 'b', dishName: 'Onion Rings', profitMargin: 95, featured: true },
  { menuItemId: 'c', dishName: 'Gulab Jamun', profitMargin: 89, featured: false },
];

describe('autopilot policy — every guardrail', () => {
  const base = { enabled: true, marginVerdict: 'margin_leak', promote, activeCount: 0, actedIds: new Set() };

  test('features the top unfeatured high-margin puzzle on a confirmed leak', () => {
    const d = decideFeatureAction(base);
    expect(d.actionType).toBe('feature_dish');
    expect(d.menuItemId).toBe('a'); // 96% margin, unfeatured
  });

  test('does nothing when autopilot is off', () => {
    expect(decideFeatureAction({ ...base, enabled: false })).toBeNull();
  });

  test('does nothing when the verdict is not a leak', () => {
    expect(decideFeatureAction({ ...base, marginVerdict: 'healthy' })).toBeNull();
  });

  test('respects the concurrent cap', () => {
    expect(decideFeatureAction({ ...base, activeCount: MAX_ACTIVE })).toBeNull();
  });

  test('never re-acts on a dish it already featured, and skips already-featured', () => {
    const d = decideFeatureAction({ ...base, actedIds: new Set(['a']) });
    expect(d.menuItemId).toBe('c'); // a is acted, b is featured → c
  });

  test('nothing to promote → nothing done', () => {
    expect(decideFeatureAction({ ...base, promote: [{ menuItemId: 'b', profitMargin: 95, featured: true }] })).toBeNull();
  });
});
