const { buildCandidates, DEFAULT_RULES } = require('../src/modules/rules/engine');
const tracker = require('../src/modules/outcomes/tracker');

/**
 * Menu engineering raised: the two loss-leaning quadrants become tracked actions.
 * Pins that plowhorses lead (medium) and dogs follow (low), each capped and keyed
 * per dish, and that the outcome metric is the dish's margin (higher is better).
 */

const rules = DEFAULT_RULES
  .filter((r) => r.ruleType === 'menu_underperformer')
  .map((r, i) => ({ id: `r${i}`, rule_type: r.ruleType, condition: r.condition, message_template: r.messageTemplate, severity: r.severity, enabled: true }));

const dish = (id, name, totalSold, profitMargin, revenue, profit) => ({ id, name, totalSold, profitMargin, revenue, profit });

describe('menu_underperformer → actions', () => {
  test('raises plowhorses (medium) and dogs (low), capped and keyed per dish', () => {
    const menuMatrix = {
      plowhorses: [dish('p1', 'Butter Chicken', 120, 18, 24000, 4000), dish('p2', 'Naan', 300, 15, 9000, 1200), dish('p3', 'Extra', 50, 19, 2000, 300)],
      dogs: [dish('d1', 'Fish Curry', 6, 12, 900, 90), dish('d2', 'Kulfi', 4, 10, 300, 20), dish('d3', 'Soup', 8, 14, 500, 60)],
    };
    const out = buildCandidates(rules, { menuMatrix }).filter((c) => c.ruleType === 'menu_underperformer');

    const plow = out.filter((c) => c.dedupeKey.startsWith('menu_underperformer:plowhorse:'));
    const dogs = out.filter((c) => c.dedupeKey.startsWith('menu_underperformer:dog:'));
    expect(plow).toHaveLength(2);      // capped at 2, biggest revenue first
    expect(dogs).toHaveLength(2);      // capped at 2, worst profit first
    expect(plow[0].dedupeKey).toBe('menu_underperformer:plowhorse:p1'); // 24000 > 9000
    expect(plow[0].priority).toBe('medium');
    expect(plow[0].title).toContain('Butter Chicken');
    expect(plow[0].description).toMatch(/18% margin/);
    expect(dogs[0].dedupeKey).toBe('menu_underperformer:dog:d2'); // profit 20 is the worst
    expect(dogs[0].priority).toBe('low');
  });

  test('no menu matrix raises nothing', () => {
    expect(buildCandidates(rules, { menuMatrix: null }).filter((c) => c.ruleType === 'menu_underperformer')).toHaveLength(0);
  });

  test('the outcome metric is the dish margin, and it improves when it rises', () => {
    expect(tracker.metricForRuleType('menu_underperformer')).toMatchObject({ name: 'menu_item_margin', perEntity: true });
    expect(tracker.evaluateChange(15, 22, 'menu_item_margin').verdict).toBe('improved');
    expect(tracker.evaluateChange(22, 15, 'menu_item_margin').verdict).toBe('worsened');
    // The dish id is the tail of the `<quadrant>:<id>` entity.
    expect(tracker.entityFromDedupeKey('menu_underperformer:plowhorse:abc-123')).toBe('plowhorse:abc-123');
  });

  test('featuring is tracked by reco impressions, which improve when they rise', () => {
    expect(tracker.metricForRuleType('reco_underexposed')).toMatchObject({ name: 'reco_dish_impressions', perEntity: true });
    // Featured a dish at 0 shown; a later window shows 12 → it worked.
    expect(tracker.evaluateChange(0, 12, 'reco_dish_impressions').verdict).toBe('improved');
    expect(tracker.evaluateChange(12, 3, 'reco_dish_impressions').verdict).toBe('worsened');
    // Entity is the bare dish id.
    expect(tracker.entityFromDedupeKey('reco_underexposed:abc-123')).toBe('abc-123');
  });
});
