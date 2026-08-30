/*
 * backfill-prep-logs — give the demo a prep history to reconcile against.
 *
 * Waste-prediction Phase 1 turns on one number nobody logged before: how much
 * of each dish was prepped. The seed has sales and waste but no prep logs, so
 * the reconciliation screen is empty. This writes a plausible prep decision for
 * each dish on each recent trading day: a plan near the day's demand, and an
 * actual that mostly over-preps a little (the pattern the feature exists to
 * surface), occasionally under-preps, occasionally lands on the nose.
 *
 * Derived from real sales — the actual is `sold` nudged by a per-day, per-dish
 * deterministic factor — so the reconciliation shows realistic over-prep, not a
 * flat fabricated margin. Idempotent (upsert per dish per day). Demo-data only.
 *
 * Usage: node scripts/backfill-prep-logs.js [restaurantId] [--days 14]
 */
const db = require('../src/shared/db');

const DEFAULT_DAYS = 14;

// A small deterministic PRNG so a re-run writes the same history.
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000; // 0..1
}

async function main() {
  const args = process.argv.slice(2);
  const restaurantId = (args.find((a) => !a.startsWith('--')))
    || (await db.query(`SELECT id FROM restaurants WHERE name = 'Demo Restaurant' LIMIT 1`)).rows[0]?.id;
  if (!restaurantId) throw new Error('No restaurant id given and no "Demo Restaurant" found');
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1], 10) : DEFAULT_DAYS;

  const tz = (await db.query(
    `SELECT value FROM settings WHERE restaurant_id = $1 AND key = 'timezone'`, [restaurantId],
  )).rows[0]?.value || 'UTC';

  let written = 0;
  const perDay = [];
  for (let d = 1; d <= days; d += 1) {
    // Portions sold per dish on this local day.
    const { rows: sold } = await db.query(
      `SELECT oi.menu_item_id, mi.name, SUM(oi.quantity)::float8 AS sold
         FROM order_items oi
         JOIN orders o     ON o.id = oi.order_id
         JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE o.restaurant_id = $1 AND o.status = 'paid'
          AND (o.created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date - $3::int
        GROUP BY oi.menu_item_id, mi.name
       HAVING SUM(oi.quantity) >= 1`,
      [restaurantId, tz, d],
    );
    if (!sold.length) continue;
    const serviceDate = (await db.query(
      `SELECT (now() AT TIME ZONE $1)::date - $2::int AS d`, [tz, d],
    )).rows[0].d;
    const dateStr = new Date(serviceDate).toISOString().slice(0, 10);

    for (const s of sold) {
      const r = seeded(`${dateStr}:${s.menu_item_id}`);
      // Mostly a modest over-prep (0–35%); ~1 in 6 under-preps; occasionally exact.
      let factor;
      if (r < 0.16) factor = 1 - (0.05 + r);        // under-prep
      else if (r < 0.28) factor = 1;                // on the nose
      else factor = 1 + (r - 0.28) * 0.5;           // over by up to ~35%
      const actual = Math.max(1, Math.round(Number(s.sold) * factor));
      const planned = Math.max(1, Math.round(actual * (0.9 + seeded(`p${dateStr}${s.menu_item_id}`) * 0.2)));

      await db.query(
        `INSERT INTO prep_logs (restaurant_id, menu_item_id, menu_item_name, service_date, forecast_qty, planned_qty, actual_qty, planned_at, actual_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
         ON CONFLICT (restaurant_id, menu_item_id, service_date) DO UPDATE
           SET planned_qty = EXCLUDED.planned_qty, actual_qty = EXCLUDED.actual_qty,
               forecast_qty = EXCLUDED.forecast_qty, updated_at = now()`,
        [restaurantId, s.menu_item_id, s.name, dateStr, planned, planned, actual],
      );
      written += 1;
    }
    perDay.push(`${dateStr}: ${sold.length} dishes`);
  }

  console.log(`Prep logs written: ${written} across ${perDay.length} days.`);
  perDay.slice(0, 5).forEach((s) => console.log('  ' + s));
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });
