/*
 * backfill-guest-visits — give the demo's loyalty guests realistic visit rhythms.
 *
 * The seed attributes so many orders to each loyalty customer that every one
 * looks like a 2-3-day regular who then vanished — so the churn view reads
 * "everybody lost", which is both alarming and false. This re-attributes orders
 * so each guest has a believable cadence (weekly to monthly) and a believable
 * recency, spread across the churn bands: some active, some due back, some
 * overdue, a few likely lost. It only changes which guest an order is credited
 * to — never an order's date or amount — so revenue, snapshots and the day's
 * takings are untouched (loyalty_customer_id feeds guest metrics alone).
 *
 * Idempotent: it clears the restaurant's loyalty attributions first, then lays
 * down the chosen pattern, so re-running lands the same place.
 *
 * Usage: node scripts/backfill-guest-visits.js [restaurantId]
 */
const db = require('../src/shared/db');

const DAY_MS = 24 * 60 * 60 * 1000;

// [cadenceDays, lastVisitDaysAgo] per guest — chosen so ratio = lastVisit/cadence
// lands a realistic mix of statuses, and every guest keeps >= 3 visits inside the
// ~90 days of order history (so a cadence can be measured).
const PROFILES = [
  // active (ratio < 1)
  [7, 3], [5, 4], [10, 6], [14, 10], [6, 5], [9, 7],
  // due (1 <= ratio < 1.5)
  [7, 9], [5, 6], [10, 13], [14, 18], [6, 7],
  // overdue (1.5 <= ratio < 3)
  [7, 15], [5, 11], [10, 22], [14, 32], [6, 12],
  // likely lost (ratio >= 3)
  [7, 35], [5, 30], [10, 50], [8, 45],
];

async function main() {
  const restaurantId = process.argv[2] || (await db.query(
    `SELECT id FROM restaurants WHERE name = 'Demo Restaurant' LIMIT 1`,
  )).rows[0]?.id;
  if (!restaurantId) throw new Error('No restaurant id given and no "Demo Restaurant" found');

  const { rows: customers } = await db.query(
    `SELECT id FROM loyalty_customers WHERE restaurant_id = $1 ORDER BY created_at, id`,
    [restaurantId],
  );
  const { rows: orderRows } = await db.query(
    `SELECT id, created_at FROM orders
      WHERE restaurant_id = $1 AND status = 'paid'
      ORDER BY created_at ASC`,
    [restaurantId],
  );
  const orders = orderRows.map((o) => ({ id: o.id, t: new Date(o.created_at).getTime(), taken: false }));
  const now = Date.now();

  // Start from a clean slate so re-runs are deterministic.
  await db.query(
    `UPDATE orders SET loyalty_customer_id = NULL WHERE restaurant_id = $1`,
    [restaurantId],
  );

  // Nearest not-yet-claimed order to a target time, within a tolerance.
  const claimNearest = (targetMs, toleranceDays) => {
    let best = null;
    let bestGap = Infinity;
    for (const o of orders) {
      if (o.taken) continue;
      const gap = Math.abs(o.t - targetMs);
      if (gap < bestGap) { bestGap = gap; best = o; }
    }
    if (best && bestGap <= toleranceDays * DAY_MS) { best.taken = true; return best.id; }
    return null;
  };

  // One loop: each guest walks its visits back from its last visit, claiming the
  // nearest free order to each target date. Shared claim state means every order
  // is credited to exactly one guest.
  let assigned = 0;
  for (let i = 0; i < customers.length; i += 1) {
    const [cadence, lastAgo] = PROFILES[i % PROFILES.length];
    const ids = [];
    for (let d = lastAgo; d <= 88; d += cadence) {
      const id = claimNearest(now - d * DAY_MS, Math.max(2, cadence / 2));
      if (id) ids.push(id);
    }
    if (ids.length) {
      await db.query(
        `UPDATE orders SET loyalty_customer_id = $2 WHERE id = ANY($1::uuid[])`,
        [ids, customers[i].id],
      );
      assigned += ids.length;
    }
  }

  console.log(`Re-attributed ${assigned} orders across ${customers.length} guests.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });
