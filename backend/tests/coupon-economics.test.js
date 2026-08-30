const { buildCouponEconomics } = require('../src/modules/economics/coupon-economics');

/**
 * Coupon economics is arithmetic on redeemed orders; the tests pin the honesty
 * of it — net kept is after discount and (delivery-only) commission, codes rank
 * cheapest-kept first, and a first-party code carries no invented platform cut.
 */
describe('buildCouponEconomics', () => {
  const rows = [
    // Big by volume, half-off: keeps little per order.
    { id: 'a', code: 'FLAT50', discountType: 'percent', discountValue: 50, orders: 100, collected: 40000, discount: 40000, deliveryCollected: 0 },
    // Small code, light discount: keeps a lot per order.
    { id: 'b', code: 'BURGER20', discountType: 'flat', discountValue: 20, orders: 10, collected: 9000, discount: 1000, deliveryCollected: 0 },
  ];

  test('ranks the code that keeps the least per order first', () => {
    const { codes } = buildCouponEconomics(rows);
    expect(codes[0].code).toBe('FLAT50');
    expect(codes[0].netPerOrder).toBe(400);   // 40000 collected / 100, no commission
    expect(codes[1].code).toBe('BURGER20');
    expect(codes[1].netPerOrder).toBe(900);
  });

  test('flags a half-off code as heavy by discount rate', () => {
    const { codes } = buildCouponEconomics(rows);
    const flat = codes.find((c) => c.code === 'FLAT50');
    expect(flat.discountRate).toBe(0.5);       // 40000 / (40000+40000)
    expect(flat.weight).toBe('heavy');
    expect(flat.hasCommission).toBe(false);    // dine-in coupon, no platform cut
  });

  test('applies the delivery commission only to delivery collection', () => {
    const dRows = [{ id: 'c', code: 'APPDEAL', orders: 10, collected: 5000, discount: 2000, deliveryCollected: 5000 }];
    const { codes } = buildCouponEconomics(dRows, { commissionRate: 0.20 });
    expect(codes[0].estCommission).toBe(1000); // 5000 * 0.20
    expect(codes[0].netKept).toBe(4000);       // 5000 - 1000
    expect(codes[0].netPerOrder).toBe(400);
    expect(codes[0].hasCommission).toBe(true);
  });

  test('summary blends net kept per order across live codes and sinks empty ones', () => {
    const withEmpty = [...rows, { id: 'z', code: 'DEAD', orders: 0, collected: 0, discount: 0, deliveryCollected: 0 }];
    const { codes, summary } = buildCouponEconomics(withEmpty);
    expect(codes[codes.length - 1].code).toBe('DEAD');
    expect(summary.activeCodes).toBe(2);
    expect(summary.totalOrders).toBe(110);
    expect(summary.avgNetPerOrder).toBe(445.45); // 49000 / 110
    expect(summary.heavyCodes).toBe(1);
  });
});
