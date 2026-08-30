/*
 * backfill-covers-sc — give the demo the Wave 3 billing capture it never recorded.
 *
 * Covers and the service-charge-removed flag are written by the billing flow from
 * now on, but historical demo bills have neither, so Average Per Cover and the
 * SC-removed panel read empty. This writes both onto past dine-in bills:
 *
 *   - orders.covers : a deterministic party size (1–6) per dining order, from a
 *     hash of the id so a re-run writes the same value. Only fills NULLs.
 *   - payments.service_charge_waived : flags ~20% of dine-in bills that carried a
 *     service charge as "guest declined", zeroing that charge and reducing the
 *     collected amount to match — the honest shape of a real waiver.
 *
 * Idempotent (covers fills only NULLs; a waived bill's SC is already 0, so a
 * re-run's `service_charge_amount > 0` filter skips it). Demo-data only.
 *
 * Usage: node scripts/backfill-covers-sc.js [restaurantId] [--days 90]
 */
const db = require('../src/shared/db');

const DEFAULT_DAYS = 90;

async function main() {
  const args = process.argv.slice(2);
  // Match a UUID positionally so a flag value (e.g. `--days 90`) is never mistaken
  // for a restaurant id — the trap the older backfill scripts fell into.
  const restaurantId = (args.find((a) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a)))
    || (await db.query(`SELECT id FROM restaurants WHERE name = 'Demo Restaurant' LIMIT 1`)).rows[0]?.id;
  if (!restaurantId) throw new Error('No restaurant id given and no "Demo Restaurant" found');
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1], 10) : DEFAULT_DAYS;
  // Demo-only: retro-apply a service charge so the SC-removed panel has something
  // to show. A real restaurant that already charges one skips this entirely.
  const scIdx = args.indexOf('--demo-sc');
  const demoScPct = scIdx >= 0 ? parseFloat(args[scIdx + 1]) : null;

  // 1. Party size on every dining bill that has none.
  const covers = await db.query(
    `UPDATE orders
        SET covers = 1 + (abs(hashtext(id::text)) % 6)
      WHERE restaurant_id = $1
        AND channel = 'dining'
        AND status = 'paid'
        AND covers IS NULL
        AND created_at >= now() - make_interval(days => $2)`,
    [restaurantId, days],
  );

  // 1b. Demo-only: turn on a service charge and retro-apply it to dine-in bills
  //     that don't carry one, so the removed-rate has a denominator to work from.
  if (demoScPct != null && demoScPct > 0) {
    const rate = demoScPct / 100;
    await db.query(
      `INSERT INTO settings (restaurant_id, key, value) VALUES ($1, 'service_charge', $2)
         ON CONFLICT (restaurant_id, key) DO UPDATE SET value = $2`,
      [restaurantId, String(demoScPct)],
    );
    await db.query(
      `UPDATE payments p
          SET service_charge_rate   = $3,
              service_charge_amount = round(p.subtotal * $3, 2),
              amount        = p.amount        + round(p.subtotal * $3, 2),
              total_charged = p.total_charged + round(p.subtotal * $3, 2)
         FROM orders o
        WHERE o.id = p.order_id
          AND o.restaurant_id = $1
          AND o.channel = 'dining'
          AND p.status = 'completed'
          AND COALESCE(p.service_charge_amount, 0) = 0
          AND p.service_charge_waived = false
          AND o.created_at >= now() - make_interval(days => $2)`,
      [restaurantId, days, rate],
    );
  }

  // 2. ~20% of dine-in bills that carried a service charge are marked removed —
  //    the charge zeroed and the collected amount reduced to match.
  const waived = await db.query(
    `WITH cand AS (
       SELECT p.id
         FROM payments p
         JOIN orders o ON o.id = p.order_id
        WHERE o.restaurant_id = $1
          AND o.channel = 'dining'
          AND p.status = 'completed'
          AND p.service_charge_amount > 0
          AND (abs(hashtext(p.id::text)) % 100) < 20
          AND o.created_at >= now() - make_interval(days => $2)
     )
     UPDATE payments p
        SET service_charge_waived = true,
            amount        = p.amount        - p.service_charge_amount,
            total_charged = p.total_charged  - p.service_charge_amount,
            service_charge_amount = 0
       FROM cand WHERE cand.id = p.id`,
    [restaurantId, days],
  );

  console.log(`Covers set on ${covers.rowCount} dining orders; service charge removed on ${waived.rowCount} bills.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });
