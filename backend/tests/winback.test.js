const winback = require('../src/modules/guests/winback');

/**
 * Winback offer policy is pure: the size of the nudge tracks how far gone the
 * guest is, and the minimum order is anchored to their own average spend rather
 * than a flat number. Status is read from the coupon so the list never keeps a
 * lifecycle that could drift from the till.
 */
describe('recommendOffer', () => {
  test('scales the discount with churn severity', () => {
    expect(winback.recommendOffer({ status: 'due', avgSpend: 400 }).discountValue).toBe(10);
    expect(winback.recommendOffer({ status: 'overdue', avgSpend: 400 }).discountValue).toBe(15);
    expect(winback.recommendOffer({ status: 'likely_lost', avgSpend: 400 }).discountValue).toBe(20);
  });

  test('a longer validity for the more-lapsed guest', () => {
    expect(winback.recommendOffer({ status: 'due' }).validDays).toBe(14);
    expect(winback.recommendOffer({ status: 'likely_lost' }).validDays).toBe(30);
  });

  test('anchors the minimum order to half the guest\'s own average, to a ₹50 step', () => {
    // avg 900 → half is 450 → already on a 50 step.
    expect(winback.recommendOffer({ status: 'overdue', avgSpend: 900 }).minOrderAmount).toBe(450);
    // avg 430 → half 215 → floored to 200.
    expect(winback.recommendOffer({ status: 'overdue', avgSpend: 430 }).minOrderAmount).toBe(200);
  });

  test('no spend to anchor to yields a zero minimum, not an invented floor', () => {
    expect(winback.recommendOffer({ status: 'overdue', avgSpend: 0 }).minOrderAmount).toBe(0);
    expect(winback.recommendOffer({ status: 'overdue' }).minOrderAmount).toBe(0);
  });

  test('an unknown status falls back to a standard offer rather than throwing', () => {
    const o = winback.recommendOffer({ status: 'whatever', avgSpend: 200 });
    expect(o.discountType).toBe('percent');
    expect(o.discountValue).toBe(10);
  });
});

describe('offerStatus', () => {
  const NOW = new Date('2026-08-28T00:00:00Z').getTime();
  const future = new Date(NOW + 5 * 86400000).toISOString();
  const past = new Date(NOW - 5 * 86400000).toISOString();

  test('a used coupon reads redeemed, whatever the expiry', () => {
    expect(winback.offerStatus({ usesCount: 1, expiresAt: past }, NOW)).toBe('redeemed');
  });

  test('an unused, unexpired, active coupon is open', () => {
    expect(winback.offerStatus({ usesCount: 0, expiresAt: future, isActive: true }, NOW)).toBe('open');
  });

  test('an unused coupon past its expiry is expired', () => {
    expect(winback.offerStatus({ usesCount: 0, expiresAt: past, isActive: true }, NOW)).toBe('expired');
  });

  test('a deactivated coupon reads void before expiry is considered', () => {
    expect(winback.offerStatus({ usesCount: 0, expiresAt: future, isActive: false }, NOW)).toBe('void');
  });
});
