/**
 * Coupon contribution — what each code actually keeps.
 *
 * The trap a discount hides: a code can be your biggest by volume and your
 * thinnest by margin at the same time. This ranks each coupon by the revenue it
 * keeps *per order* after the discount given and, for orders on a commissioned
 * channel, the platform's cut — so "paying to be popular" stops being a feeling
 * and becomes a number.
 *
 * Honesty notes:
 *   - Revenue is `payments.amount` on completed payments, the one definition the
 *     reports and economics pages already use. `collected` is post-discount (what
 *     the guest actually paid); `discount` is what was foregone, shown beside it.
 *   - Commission only applies to delivery-channel redemptions, at the outlet's
 *     average contracted rate — first-party (dine-in/takeaway) coupons carry no
 *     platform cut, and the module says so by leaving it at zero rather than
 *     inventing one. It is an estimate (the order doesn't record which aggregator
 *     it came from), labelled as such.
 *   - This is net revenue kept, not profit: it does not subtract food cost. A
 *     code that keeps little per order is a flag to investigate, not a verdict.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// A code giving away this share of gross is structurally heavy, whatever its volume.
const HEAVY_DISCOUNT = 0.40;
const MODERATE_DISCOUNT = 0.20;

/**
 * @param rows [{ id, code, discountType, discountValue, orders, collected, discount, deliveryCollected }]
 * @param opts { commissionRate }  average delivery commission as a fraction (0..1)
 */
function buildCouponEconomics(rows = [], { commissionRate = 0 } = {}) {
  const rate = Number(commissionRate) || 0;

  const codes = rows.map((r) => {
    const orders = Number(r.orders) || 0;
    const collected = Number(r.collected) || 0;
    const discount = Number(r.discount) || 0;
    const deliveryCollected = Number(r.deliveryCollected) || 0;

    // Pre-discount value of the trade these codes drove.
    const gross = collected + discount;
    const estCommission = round2(deliveryCollected * rate);
    const netKept = round2(collected - estCommission);

    const discountRate = gross > 0 ? discount / gross : 0;
    const weight = discountRate >= HEAVY_DISCOUNT ? 'heavy'
      : discountRate >= MODERATE_DISCOUNT ? 'moderate' : 'light';

    return {
      id: r.id,
      code: r.code,
      discountType: r.discountType || null,
      discountValue: r.discountValue == null ? null : Number(r.discountValue),
      orders,
      gross: round2(gross),
      collected: round2(collected),
      discount: round2(discount),
      estCommission,
      netKept,
      netPerOrder: orders ? round2(netKept / orders) : null,
      discountPerOrder: orders ? round2(discount / orders) : null,
      grossPerOrder: orders ? round2(gross / orders) : null,
      discountRate: round2(discountRate),
      weight,
      hasCommission: estCommission > 0,
    };
  });

  // Costliest first: the codes keeping the least per order are the ones to read.
  // Codes with no orders sink to the bottom (nothing to say about them yet).
  codes.sort((a, b) => {
    if (a.netPerOrder == null) return 1;
    if (b.netPerOrder == null) return -1;
    return a.netPerOrder - b.netPerOrder;
  });

  const live = codes.filter((c) => c.orders > 0);
  const totalOrders = live.reduce((s, c) => s + c.orders, 0);
  const totalDiscount = round2(live.reduce((s, c) => s + c.discount, 0));
  const totalNetKept = round2(live.reduce((s, c) => s + c.netKept, 0));
  const totalCommission = round2(live.reduce((s, c) => s + c.estCommission, 0));

  return {
    codes,
    summary: {
      activeCodes: live.length,
      totalCodes: codes.length,
      totalOrders,
      totalDiscount,
      totalCommission,
      totalNetKept,
      // Blended net kept per order across every redeemed code — the single number
      // that answers "are my discounts pulling their weight."
      avgNetPerOrder: totalOrders ? round2(totalNetKept / totalOrders) : null,
      heavyCodes: live.filter((c) => c.weight === 'heavy').length,
      commissionApplies: totalCommission > 0,
    },
  };
}

module.exports = { buildCouponEconomics, HEAVY_DISCOUNT, MODERATE_DISCOUNT };
