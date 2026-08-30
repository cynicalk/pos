const {
  evaluateCouponLoss, evaluateAttachDrop, evaluateScRemoval,
} = require('../src/modules/rules/operator-intel');
const { estimateOpportunities } = require('../src/modules/rules/opportunity');

/**
 * Wave 4 rules turn the operator-intelligence findings into raised actions. The
 * tests pin the thresholds and the abstention: a normal promotion, a category
 * that's flat or growing, and a server with too few bills all raise nothing.
 */

const couponRule = {
  id: 'r1', rule_type: 'coupon_loss', enabled: true,
  condition: { field: 'discount_rate', op: '>=', value: 40 },
  message_template: '{code} ran {orders} orders at {discount_rate}% off — keep ₹{net_per_order}.',
  severity: 'medium',
};
const attachRule = {
  id: 'r2', rule_type: 'attach_drop', enabled: true,
  condition: { field: 'attach_drop', op: '>=', value: 0.03 },
  message_template: '{category} fell to {attach} (was {prev_attach}), down {drop}.',
  severity: 'low',
};
const scRule = {
  id: 'r3', rule_type: 'sc_removal_high', enabled: true,
  condition: { field: 'removed_pct', op: '>=', value: 25 },
  message_template: '{server} removed SC on {waived}/{applicable} ({removed_pct}%) vs {outlet_pct}%.',
  severity: 'medium',
};

describe('evaluateCouponLoss', () => {
  test('fires on a heavy-discount code with real volume', () => {
    const couponEconomics = { codes: [
      { code: 'FLAT50', orders: 100, discountRate: 0.5, netPerOrder: 400, discountPerOrder: 400 },
      { code: 'SAVE10', orders: 100, discountRate: 0.1, netPerOrder: 900, discountPerOrder: 100 },
    ] };
    const out = evaluateCouponLoss([couponRule], { couponEconomics });
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe('coupon_loss:FLAT50');
    expect(out[0].description).toContain('50% off');
  });

  test('ignores a heavy code with too few orders', () => {
    const couponEconomics = { codes: [{ code: 'TINY', orders: 3, discountRate: 0.6, netPerOrder: 200, discountPerOrder: 300 }] };
    expect(evaluateCouponLoss([couponRule], { couponEconomics })).toHaveLength(0);
  });
});

describe('evaluateAttachDrop', () => {
  const attach = { categories: [
    { category: 'Desserts', highMargin: true,  attach: 0.10, prevAttach: 0.14, delta: -0.04 },
    { category: 'Drinks',   highMargin: true,  attach: 0.55, prevAttach: 0.56, delta: -0.01 }, // too small
    { category: 'Mains',    highMargin: false, attach: 1.2,  prevAttach: 1.4,  delta: -0.20 }, // not high-margin
  ] };

  test('fires only on a high-margin category that fell past the threshold', () => {
    const out = evaluateAttachDrop([attachRule], { attach, windowDays: 30 });
    expect(out.map((o) => o.dedupeKey)).toEqual(['attach_drop:Desserts']);
    expect(out[0].description).toContain('0.04');
  });

  test('says nothing when a category has no prior window to compare', () => {
    const noPrior = { categories: [{ category: 'Desserts', highMargin: true, attach: 0.1, prevAttach: null, delta: null }] };
    expect(evaluateAttachDrop([attachRule], { attach: noPrior })).toHaveLength(0);
  });
});

describe('evaluateScRemoval', () => {
  test('fires on a server above the threshold with enough bills', () => {
    const scRemoved = { removedPct: 12, servers: [
      { server: 'Riya',  applicable: 40, waived: 12, removedPct: 30 },
      { server: 'Arjun', applicable: 40, waived: 8,  removedPct: 20 }, // below 25
      { server: 'Noor',  applicable: 5,  waived: 3,  removedPct: 60 }, // too few bills
    ] };
    const out = evaluateScRemoval([scRule], { scRemoved });
    expect(out.map((o) => o.dedupeKey)).toEqual(['sc_removal_high:Riya']);
    expect(out[0].description).toContain('vs 12%');
  });
});

describe('opportunity — coupon_loss pricing', () => {
  test('prices a coupon action by the discount its code actually gave away', () => {
    const actions = [{ id: 'a', rule_type: 'coupon_loss', dedupe_key: 'coupon_loss:FLAT50', priority: 'medium' }];
    const est = estimateOpportunities(actions, { couponDiscount: { FLAT50: 41000 } });
    expect(est.get('a').amount).toBe(41000);
    expect(est.get('a').basis).toContain('discount given');
  });

  test('a coupon action with no measured discount stays unpriced, not zero', () => {
    const actions = [{ id: 'a', rule_type: 'coupon_loss', dedupe_key: 'coupon_loss:GHOST', priority: 'medium' }];
    const est = estimateOpportunities(actions, { couponDiscount: {} });
    expect(est.get('a').amount).toBeNull();
  });
});
