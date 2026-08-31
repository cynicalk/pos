const db = require('../shared/db');

// The per-day figures the Daily Brief opens on. Everything else in the brief is
// a window aggregate already served by the insights/actions/snapshots services;
// only "yesterday" needs its own single-day read, and covers is the one figure
// the snapshot table does not carry, so it is joined from orders here.

/**
 * One closed trading day's headline, from the snapshot the scheduler already
 * writes (same SUM(payments.amount) revenue as reports and the group rollup),
 * with the guest-count total for that day's dining orders alongside it.
 *
 * Returns null when there is no snapshot for the day — a day the outlet never
 * traded — so the brief can say "closed / no trade" rather than print a zero
 * that reads like a catastrophe.
 */
const getDayHeadline = (restaurantId, day, tz) =>
  db.query(
    `
    WITH snap AS (
      SELECT total_revenue, total_orders, avg_order_value
      FROM daily_snapshots
      WHERE restaurant_id = $1 AND snapshot_date = $2::date
    ),
    covers AS (
      SELECT COALESCE(SUM(o.covers), 0)::int          AS covers,
             COUNT(*) FILTER (WHERE o.covers IS NOT NULL)::int AS covered_orders,
             COUNT(*)::int                            AS dining_orders
      FROM orders o
      JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
      WHERE o.restaurant_id = $1
        AND o.channel = 'dining'
        AND (o.created_at AT TIME ZONE $3)::date = $2::date
    )
    SELECT snap.total_revenue::float8   AS revenue,
           snap.total_orders            AS orders,
           snap.avg_order_value::float8 AS avg_order_value,
           covers.covers,
           covers.covered_orders,
           covers.dining_orders
    FROM snap, covers
    `,
    [restaurantId, day, tz],
  ).then((r) => r.rows[0] || null);

module.exports = { getDayHeadline };
