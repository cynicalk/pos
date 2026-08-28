/*
 * backfill-launch-dates — give the demo menu a realistic launch history.
 *
 * The New Item Performance tracker keys on menu_items.created_at: it shows the
 * dishes launched inside a recent window and scores each against the menu's own
 * median daily rate. The seed stamps every dish with the same created_at (the
 * moment it ran), so the tracker sees a 40-dish menu all launched at once — all
 * "too early", nothing to compare against.
 *
 * This spreads the launch dates the way a real menu grows: most dishes are the
 * established core (set well outside the tracker's window), and a handful are
 * genuine recent launches with enough runway to earn a verdict. It changes only
 * created_at — sales, recipes and everything else are untouched — so the tracker
 * lights up with real, already-recorded numbers rather than invented ones.
 *
 * Idempotent: re-running sets the same dates. Demo-data only; safe to skip in
 * any real deployment, where dishes carry their true launch dates already.
 *
 * Usage: node scripts/backfill-launch-dates.js [restaurantId]
 */
const db = require('../src/shared/db');

// A curated set of "recent launches", chosen to span the verdict range — strong
// sellers that should read as outperforming, quiet ones that should read as a
// slow start — so the screen demonstrates the full spread, not one flat state.
const RECENT_LAUNCHES = [
  { name: 'Margherita Pizza',      daysAgo: 12 }, // strong seller → outperforming
  { name: 'Dal Makhani',           daysAgo: 18 }, // strong seller → outperforming
  { name: 'Paneer Tikka',          daysAgo: 22 }, // mid
  { name: 'Tiramisu',              daysAgo: 26 }, // quiet → slow start
  { name: 'Mango Sorbet',          daysAgo: 29 }, // quiet → slow start
];

const daysAgoIso = (d) => new Date(Date.now() - d * 86400000).toISOString();

async function main() {
  const restaurantId = process.argv[2] || (await db.query(
    `SELECT id FROM restaurants WHERE name = 'Demo Restaurant' LIMIT 1`,
  )).rows[0]?.id;
  if (!restaurantId) throw new Error('No restaurant id given and no "Demo Restaurant" found');

  const { rows: dishes } = await db.query(
    `SELECT id, name FROM menu_items WHERE restaurant_id = $1 AND archived_at IS NULL ORDER BY name`,
    [restaurantId],
  );
  const recent = new Map(RECENT_LAUNCHES.map((r) => [r.name, r.daysAgo]));

  let newCount = 0;
  let establishedCount = 0;
  // Established dishes fan out from ~60 to ~400 days ago, deterministically by
  // position, so the core menu sits comfortably outside the 30-day window.
  const established = dishes.filter((d) => !recent.has(d.name));

  for (const d of dishes) {
    if (recent.has(d.name)) {
      await db.query(`UPDATE menu_items SET created_at = $2 WHERE id = $1`, [d.id, daysAgoIso(recent.get(d.name))]);
      newCount += 1;
    }
  }
  established.forEach((d, i) => {
    const daysAgo = 60 + Math.round((i / Math.max(1, established.length - 1)) * 340);
    // fire-and-collect below
    established[i]._daysAgo = daysAgo;
  });
  for (const d of established) {
    await db.query(`UPDATE menu_items SET created_at = $2 WHERE id = $1`, [d.id, daysAgoIso(d._daysAgo)]);
    establishedCount += 1;
  }

  console.log(`Launch dates set: ${newCount} recent launches, ${establishedCount} established dishes.`);
  console.log('Recent launches:', RECENT_LAUNCHES.map((r) => `${r.name} (${r.daysAgo}d)`).join(', '));
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });
