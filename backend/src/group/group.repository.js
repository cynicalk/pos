const db = require('../shared/db');

/*
 * Multi-outlet rollup data access (MERGE_PLAN.md Phase 7).
 *
 * Every query here is SET-BASED across the visible outlets — one query per
 * metric, grouped by restaurant_id — rather than the source's fan-out of a full
 * per-outlet computation. The source ran six queries per outlet inside a
 * Promise.all over outlets; at ten outlets that is sixty round trips to render
 * one table, and it grows with the group. These return one row per outlet from
 * one statement.
 *
 * The definitions are copied from the per-outlet queries in
 * insights.repository deliberately, not re-derived: the group page must agree
 * with the outlet page it summarises, and the way to guarantee that is for the
 * SQL to say the same thing.
 */

/* ── The grant boundary ─────────────────────────────────────────────────── */

/**
 * Which outlets this user may see, per the rule migration 072 established:
 *
 *   admin with NO grant rows  → every outlet in their organization (owner)
 *   admin WITH grant rows     → only the granted outlets            (manager)
 *   any other role            → their own restaurant only
 *
 * The role check is NOT done here — the router authorises before calling — but
 * the grant filter is, because it is the part that must never be forgotten at a
 * call site. A rollup that quietly includes an outlet the user was not granted
 * is a data leak wearing a dashboard.
 */
const listVisibleOutlets = (userId, restaurantId) =>
  db.query(
    `WITH org AS (
       SELECT organization_id FROM restaurants WHERE id = $2
     ),
     grants AS (
       SELECT restaurant_id FROM owner_outlets WHERE user_id = $1
     )
     SELECT r.id, r.name, r.organization_id
       FROM restaurants r
      WHERE r.organization_id = (SELECT organization_id FROM org)
        AND (
          -- No grants recorded: the owner case, every outlet in the org.
          NOT EXISTS (SELECT 1 FROM grants)
          -- Grants recorded: exactly those, and always their own outlet, so a
          -- manager granted nothing still sees where they actually work rather
          -- than an empty page.
          OR r.id IN (SELECT restaurant_id FROM grants)
          OR r.id = $2
        )
      ORDER BY r.name`,
    [userId, restaurantId],
  ).then((r) => r.rows);

/* ── Per-outlet metrics, one statement each ─────────────────────────────── */

/** Order counts and cancellation loss. Mirrors insights.getCancellationTotals. */
const getOrderStats = (outletIds, days) =>
  db.query(
    `SELECT o.restaurant_id,
            COUNT(*)::int                                        AS total_orders,
            COUNT(*) FILTER (WHERE o.status = 'cancelled')::int  AS cancelled_orders,
            COALESCE(SUM(
              CASE WHEN o.status = 'cancelled' THEN (
                SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0)
                  FROM order_items oi WHERE oi.order_id = o.id
              ) ELSE 0 END
            ), 0) AS lost_revenue
       FROM orders o
      WHERE o.restaurant_id = ANY($1::uuid[])
        AND o.created_at >= now() - make_interval(days => $2)
      GROUP BY o.restaurant_id`,
    [outletIds, days],
  ).then((r) => r.rows);

/**
 * Revenue, on the definition Phase 0 pinned: completed payments.
 *
 * Payments are summed directly rather than through orders, because joining the
 * two and summing would multiply nothing here — but a future reader adding a
 * second join would find it easy to break. Keeping payments alone makes the
 * split-bill case impossible to get wrong.
 */
const getRevenue = (outletIds, days) =>
  db.query(
    `SELECT o.restaurant_id,
            COALESCE(SUM(p.amount), 0) AS revenue
       FROM payments p
       JOIN orders o ON o.id = p.order_id
      WHERE o.restaurant_id = ANY($1::uuid[])
        AND p.status = 'completed'
        AND o.created_at >= now() - make_interval(days => $2)
      GROUP BY o.restaurant_id`,
    [outletIds, days],
  ).then((r) => r.rows);

/** Food cost of what sold, counting only lines with a costed recipe. */
const getFoodCost = (outletIds, days) =>
  db.query(
    `WITH lines AS (
       SELECT o.restaurant_id,
              oi.quantity,
              mi.price AS unit_price,
              (
                SELECT COALESCE(SUM(ri.quantity * ri.cost_per_unit), 0)
                  FROM recipe_ingredients ri
                 WHERE ri.recipe_id = mi.recipe_id
              ) AS unit_cost
         FROM order_items oi
         JOIN orders o      ON o.id = oi.order_id
         JOIN payments p    ON p.order_id = o.id AND p.status = 'completed'
         JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE o.restaurant_id = ANY($1::uuid[])
          AND o.created_at >= now() - make_interval(days => $2)
          AND oi.status IS DISTINCT FROM 'cancelled'
     )
     SELECT restaurant_id,
            COALESCE(SUM(quantity * unit_cost)  FILTER (WHERE unit_cost > 0), 0) AS food_cost,
            COALESCE(SUM(quantity * unit_price) FILTER (WHERE unit_cost > 0), 0) AS item_revenue,
            COUNT(*) FILTER (WHERE unit_cost > 0)::int                           AS items_costed,
            COUNT(*)::int                                                        AS items_total
       FROM lines
      GROUP BY restaurant_id`,
    [outletIds, days],
  ).then((r) => r.rows);

/**
 * Rating over each outlet's most recent reviews.
 *
 * Windowed to the last N reviews per outlet rather than the last N days, so a
 * quiet outlet is compared on its own recent feedback instead of reporting
 * nothing. Same shape as the rules engine's RATING_WINDOW.
 */
const getRatings = (outletIds, windowSize) =>
  db.query(
    `WITH ranked AS (
       SELECT restaurant_id, overall_rating,
              ROW_NUMBER() OVER (
                PARTITION BY restaurant_id ORDER BY created_at DESC
              ) AS rn
         FROM reviews
        WHERE restaurant_id = ANY($1::uuid[])
     )
     SELECT restaurant_id,
            AVG(overall_rating)::numeric(3,2) AS avg_rating,
            COUNT(*)::int                     AS review_count
       FROM ranked
      WHERE rn <= $2
      GROUP BY restaurant_id`,
    [outletIds, windowSize],
  ).then((r) => r.rows);

/** Open findings per outlet, split by urgency. */
const getActionCounts = (outletIds) =>
  db.query(
    `SELECT restaurant_id,
            COUNT(*)::int AS open_actions,
            COUNT(*) FILTER (WHERE priority IN ('critical','high'))::int AS urgent_actions
       FROM actions
      WHERE restaurant_id = ANY($1::uuid[])
        AND status IN ('open','acknowledged')
      GROUP BY restaurant_id`,
    [outletIds],
  ).then((r) => r.rows);

/**
 * The open findings themselves, carrying the outlet name.
 *
 * The name is joined in here rather than stitched on in JS so a finding can
 * never reach the merged queue without one — an item that loses its outlet is a
 * problem nobody can be sent to fix.
 */
const listOpenActions = (outletIds, limit) =>
  db.query(
    `SELECT a.id, a.restaurant_id, a.title, a.description, a.priority,
            a.created_at, r2.rule_type, rest.name AS outlet_name
       FROM actions a
       LEFT JOIN rules r2      ON r2.id = a.rule_id
       JOIN restaurants rest   ON rest.id = a.restaurant_id
      WHERE a.restaurant_id = ANY($1::uuid[])
        AND a.status IN ('open','acknowledged')
      ORDER BY a.created_at DESC
      LIMIT $2`,
    [outletIds, limit],
  ).then((r) => r.rows);

const getOrganization = (restaurantId) =>
  db.query(
    `SELECT o.id, o.name
       FROM organizations o
       JOIN restaurants r ON r.organization_id = o.id
      WHERE r.id = $1`,
    [restaurantId],
  ).then((r) => r.rows[0]);

/** Total outlets in the org, whether or not this user may see them. */
const countOrgOutlets = (restaurantId) =>
  db.query(
    `SELECT COUNT(*)::int AS total
       FROM restaurants
      WHERE organization_id = (
        SELECT organization_id FROM restaurants WHERE id = $1
      )`,
    [restaurantId],
  ).then((r) => Number(r.rows[0]?.total || 0));

module.exports = {
  listVisibleOutlets,
  getOrderStats,
  getRevenue,
  getFoodCost,
  getRatings,
  getActionCounts,
  listOpenActions,
  getOrganization,
  countOrgOutlets,
};
