const db = require('../shared/db');

// Timezone values reaching these queries are validated by the service via
// shared/timezone.validateTimezone before they are bound. They are still passed
// as parameters, never interpolated.

/** The restaurant's configured trading-day zone; UTC when unset. */
const getTimezone = (restaurantId) =>
  db.query(
    `SELECT value FROM settings WHERE restaurant_id = $1 AND key = 'timezone'`,
    [restaurantId],
  ).then((r) => r.rows[0]?.value || 'UTC');

const listActiveRestaurants = () =>
  db.query(`SELECT id FROM restaurants WHERE is_active IS NOT false`)
    .then((r) => r.rows.map((x) => x.id));

/**
 * Trading days that need a snapshot written, oldest first:
 *   - every day with orders that has no snapshot row (first-run backfill, plus
 *     self-healing after any downtime), and
 *   - the last `refreshDays` days regardless, because a day is not final when
 *     it ends — a late payment, a void or a corrected order still moves it.
 *
 * Today is included: the row is refreshed on each pass and settles once the
 * day stops changing. Callers that need a *closed* day should read snapshots
 * strictly before today.
 */
const findPendingDays = (restaurantId, tz, refreshDays) =>
  db.query(`
    WITH days AS (
      SELECT DISTINCT (o.created_at AT TIME ZONE $2)::date AS d
      FROM orders o
      WHERE o.restaurant_id = $1
    )
    SELECT days.d::text AS day
    FROM days
    WHERE days.d <= (now() AT TIME ZONE $2)::date
      AND (
        days.d >= (now() AT TIME ZONE $2)::date - $3::int
        OR NOT EXISTS (
          SELECT 1 FROM daily_snapshots s
          WHERE s.restaurant_id = $1 AND s.snapshot_date = days.d
        )
      )
    ORDER BY days.d
  `, [restaurantId, tz, refreshDays]).then((r) => r.rows.map((x) => x.day));

/**
 * Compute and upsert one trading day in a single statement.
 *
 * Revenue is `SUM(payments.amount) WHERE payments.status = 'completed'`, which
 * is character-for-character the definition reports.repository.getDailySummary
 * uses. Snapshots and the daily report MUST agree — two definitions of revenue
 * in one system is a drift bug that only surfaces months later, in a forecast.
 *
 * item_sales counts only items on orders that actually got paid, and excludes
 * cancelled lines: a forecast should learn what guests bought, not what was
 * rung up and voided.
 */
const upsertDay = (restaurantId, day, tz) =>
  db.query(`
    WITH paid AS (
      SELECT o.id, COALESCE(SUM(p.amount), 0) AS amt
      FROM orders o
      JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
      WHERE o.restaurant_id = $1
        AND (o.created_at AT TIME ZONE $3)::date = $2::date
      GROUP BY o.id
    ),
    totals AS (
      SELECT COUNT(*)::int AS orders_n, COALESCE(SUM(amt), 0) AS revenue FROM paid
    ),
    cancelled AS (
      SELECT COUNT(*)::int AS n
      FROM orders
      WHERE restaurant_id = $1
        AND status = 'cancelled'
        AND (created_at AT TIME ZONE $3)::date = $2::date
    ),
    items AS (
      SELECT COALESCE(jsonb_object_agg(name, qty), '{}'::jsonb) AS item_sales
      FROM (
        SELECT COALESCE(oi.item_name, mi.name) AS name, SUM(oi.quantity)::int AS qty
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE o.id IN (SELECT id FROM paid)
          AND oi.status IS DISTINCT FROM 'cancelled'
          AND COALESCE(oi.item_name, mi.name) IS NOT NULL
        GROUP BY 1
      ) t
    ),
    ratings AS (
      SELECT COUNT(*)::int AS n, AVG(overall_rating)::numeric(3,2) AS avg
      FROM reviews
      WHERE restaurant_id = $1
        AND (created_at AT TIME ZONE $3)::date = $2::date
    )
    INSERT INTO daily_snapshots (
      restaurant_id, snapshot_date, timezone, total_orders, total_revenue,
      avg_order_value, cancelled_orders, review_count, avg_rating, item_sales
    )
    SELECT
      $1, $2::date, $3,
      totals.orders_n,
      totals.revenue,
      CASE WHEN totals.orders_n > 0
           THEN ROUND(totals.revenue / totals.orders_n, 2)
           ELSE 0 END,
      cancelled.n,
      ratings.n,
      ratings.avg,
      items.item_sales
    FROM totals, cancelled, items, ratings
    ON CONFLICT (restaurant_id, snapshot_date) DO UPDATE SET
      timezone         = EXCLUDED.timezone,
      total_orders     = EXCLUDED.total_orders,
      total_revenue    = EXCLUDED.total_revenue,
      avg_order_value  = EXCLUDED.avg_order_value,
      cancelled_orders = EXCLUDED.cancelled_orders,
      review_count     = EXCLUDED.review_count,
      avg_rating       = EXCLUDED.avg_rating,
      item_sales       = EXCLUDED.item_sales,
      updated_at       = now()
    RETURNING snapshot_date::text AS snapshot_date, total_orders, total_revenue
  `, [restaurantId, day, tz]).then((r) => r.rows[0]);

/**
 * How much history exists, for the `collecting` shell state. Counts only
 * CLOSED days (strictly before today) — today is still moving and must not be
 * advertised as a completed day of history.
 */
const getCoverage = (restaurantId, tz) =>
  db.query(`
    SELECT
      COUNT(*)::int                AS days,
      MIN(snapshot_date)::text     AS first_day,
      MAX(snapshot_date)::text     AS last_day
    FROM daily_snapshots
    WHERE restaurant_id = $1
      AND snapshot_date < (now() AT TIME ZONE $2)::date
  `, [restaurantId, tz]).then((r) => r.rows[0]);

/**
 * The daily revenue series for anomaly detection (Phase 9).
 *
 * generate_series fills gaps with real zeros rather than skipping closed days:
 * a day the restaurant did not trade IS the anomaly worth seeing, and a series
 * with holes in it would silently compare Tuesday against last Thursday.
 *
 * `revenue` is the snapshot's own figure, which is the same
 * SUM(payments.amount) WHERE status='completed' that reports and the group
 * rollup use — so an anomaly alert and the revenue report can never disagree
 * about what a day took.
 */
const getRevenueSeries = (restaurantId, tz, days) =>
  db.query(`
    WITH bounds AS (
      SELECT (now() AT TIME ZONE $2)::date AS today
    ),
    span AS (
      SELECT generate_series(
        (SELECT today FROM bounds) - ($3::int - 1),
        (SELECT today FROM bounds),
        INTERVAL '1 day'
      )::date AS d
    )
    SELECT span.d::text AS date,
           COALESCE(s.total_revenue, 0)::float8 AS revenue
      FROM span
      LEFT JOIN daily_snapshots s
        ON s.restaurant_id = $1 AND s.snapshot_date = span.d
     ORDER BY span.d
  `, [restaurantId, tz, days]).then((r) => r.rows);

/** The restaurant's current local trading day, so today can be excluded. */
const getLocalToday = (restaurantId, tz) =>
  db.query(`SELECT (now() AT TIME ZONE $1)::date::text AS today`, [tz])
    .then((r) => r.rows[0].today);

module.exports = {
  getRevenueSeries,
  getLocalToday,
  getTimezone,
  listActiveRestaurants,
  findPendingDays,
  upsertDay,
  getCoverage,
};
