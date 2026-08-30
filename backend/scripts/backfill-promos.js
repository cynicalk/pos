/*
 * backfill-promos — give the demo a few real promo days for the forecast to
 * detect and set aside.
 *
 * Promo-aware forecasting reads coupon redemptions: a day where a material share
 * of orders carried a discount is excluded from the baseline so it does not
 * inflate future same-weekday demand. The seed has no redemptions, so the
 * feature is correct but invisible. This stages a promo coupon and redeems it on
 * ~a quarter of the orders on three historical days — enough to clear the
 * detector's floor (3 redemptions) and share (15%) — dated to the order itself
 * so the redemption lands on the day it distorted.
 *
 * Idempotent: it keys on the promo code and clears its old redemptions first.
 * Demo-data only.
 *
 * Usage: node scripts/backfill-promos.js [restaurantId]
 */
const db = require('./..//src/shared/db');

const PROMO_CODE = 'DEMOPROMO20';
const DISCOUNT_PCT = 20;
const PROMO_DAYS_AGO = [20, 34, 47]; // three past promo days on different weekdays
const SHARE = 0.25;                  // redeem on about a quarter of the day's orders

async function main() {
  const restaurantId = process.argv[2] || (await db.query(
    `SELECT id FROM restaurants WHERE name = 'Demo Restaurant' LIMIT 1`,
  )).rows[0]?.id;
  if (!restaurantId) throw new Error('No restaurant id given and no "Demo Restaurant" found');

  // A promo coupon to hang the redemptions on (created once, reused on re-run).
  let { rows: [coupon] } = await db.query(
    `SELECT id FROM coupons WHERE restaurant_id = $1 AND code = $2`,
    [restaurantId, PROMO_CODE],
  );
  if (!coupon) {
    ({ rows: [coupon] } = await db.query(
      `INSERT INTO coupons (restaurant_id, code, description, discount_type, discount_value)
       VALUES ($1, $2, 'Demo weekend promotion', 'percent', $3) RETURNING id`,
      [restaurantId, PROMO_CODE, DISCOUNT_PCT],
    ));
  }

  // Clear prior demo redemptions for this coupon so re-runs are stable.
  await db.query('DELETE FROM coupon_redemptions WHERE coupon_id = $1', [coupon.id]);
  await db.query('UPDATE coupons SET uses_count = 0 WHERE id = $1', [coupon.id]);

  let total = 0;
  const summary = [];
  for (const daysAgo of PROMO_DAYS_AGO) {
    // Paid orders on that local day, with their payment subtotal to discount.
    const { rows: orders } = await db.query(
      `SELECT o.id, o.created_at, COALESCE(p.subtotal, p.total_charged, 0)::float8 AS base
         FROM orders o
         JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
        WHERE o.restaurant_id = $1
          AND o.status = 'paid'
          AND (o.created_at)::date = (now()::date - $2::int)
        ORDER BY o.created_at`,
      [restaurantId, daysAgo],
    );
    if (!orders.length) { summary.push(`${daysAgo}d ago: no orders`); continue; }

    const take = Math.max(3, Math.round(orders.length * SHARE));
    const chosen = orders.slice(0, take);
    for (const o of chosen) {
      const discount = Math.round(Number(o.base) * (DISCOUNT_PCT / 100) * 100) / 100;
      // Dated to the order so the redemption groups onto the day it distorted.
      // eslint-disable-next-line no-await-in-loop
      await db.query(
        `INSERT INTO coupon_redemptions (coupon_id, order_id, restaurant_id, discount_amount, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (order_id) DO NOTHING`,
        [coupon.id, o.id, restaurantId, discount, o.created_at],
      );
    }
    total += chosen.length;
    summary.push(`${daysAgo}d ago: ${chosen.length} of ${orders.length} orders (${Math.round(chosen.length / orders.length * 100)}%)`);
  }
  await db.query('UPDATE coupons SET uses_count = $2 WHERE id = $1', [coupon.id, total]);

  console.log(`Promo redemptions written: ${total} across ${PROMO_DAYS_AGO.length} days.`);
  summary.forEach((s) => console.log('  ' + s));
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });
