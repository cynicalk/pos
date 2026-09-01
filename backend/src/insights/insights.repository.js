const db = require('../shared/db');

// Insights is READ-ONLY — it never writes to any table.
//
// Two conventions are shared with reports.repository.js on purpose, so the
// numbers on these pages can never disagree with the numbers on Reports:
//   revenue      = payments where status = 'completed'
//   a dish's cost = SUM(recipe_ingredients.quantity * cost_per_unit)
// A second definition of either would be a drift bug that only surfaces when an
// operator notices two screens contradicting each other.

/** Per-dish volume, revenue and unit cost over a window. */
const getMenuPerformance = (restaurantId, days) =>
  db.query(`
    SELECT
      mi.id,
      mi.name,
      mi.category,
      mi.price                                AS selling_price,
      COALESCE(SUM(oi.quantity), 0)::int      AS total_sold,
      COALESCE(SUM(mi.price * oi.quantity), 0) AS revenue,
      (
        SELECT COALESCE(SUM(ri.quantity * ri.cost_per_unit), 0)
        FROM recipe_ingredients ri
        WHERE ri.recipe_id = mi.recipe_id
      )                                       AS cost_per_unit
    FROM menu_items mi
    LEFT JOIN order_items oi ON oi.menu_item_id = mi.id
    LEFT JOIN orders o      ON o.id = oi.order_id
                           AND o.restaurant_id = $1
                           AND o.created_at >= now() - make_interval(days => $2)
    LEFT JOIN payments p    ON p.order_id = o.id AND p.status = 'completed'
    WHERE mi.restaurant_id = $1
      AND mi.archived_at IS NULL
      -- A LEFT JOIN that failed the payment filter must contribute nothing, or
      -- an unsold dish would count the row as a sale of quantity NULL.
      AND (oi.id IS NULL OR p.id IS NOT NULL)
    GROUP BY mi.id, mi.name, mi.category, mi.price, mi.recipe_id
    ORDER BY revenue DESC
  `, [restaurantId, days]).then((r) => r.rows);

/** Distinct trading days with sales in the window, for per-day averages. */
const getSpanDays = (restaurantId, tz, days) =>
  db.query(`
    SELECT COUNT(DISTINCT (o.created_at AT TIME ZONE $2)::date)::int AS span
    FROM orders o
    JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
    WHERE o.restaurant_id = $1
      AND o.created_at >= now() - make_interval(days => $3)
  `, [restaurantId, tz, days]).then((r) => Number(r.rows[0]?.span || 0));

/** Basket lines for the association-rule pass. */
const getBasketLines = (restaurantId, days) =>
  db.query(`
    SELECT oi.order_id, COALESCE(oi.item_name, mi.name) AS item_name
    FROM order_items oi
    JOIN orders o        ON o.id = oi.order_id
    JOIN payments p      ON p.order_id = o.id AND p.status = 'completed'
    LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE o.restaurant_id = $1
      AND o.created_at >= now() - make_interval(days => $2)
      AND oi.status IS DISTINCT FROM 'cancelled'
      AND COALESCE(oi.item_name, mi.name) IS NOT NULL
  `, [restaurantId, days]).then((r) => r.rows);

/**
 * Dishes added recently, with sales counted only from their own launch date.
 * Rows without created_at are excluded here rather than downstream — a dish
 * with no launch date has no launch curve.
 */
const getNewItems = (restaurantId, windowDays) =>
  db.query(`
    SELECT
      mi.id, mi.name, mi.category, mi.created_at,
      COALESCE(SUM(oi.quantity), 0)::int        AS sold,
      COALESCE(SUM(mi.price * oi.quantity), 0)  AS revenue
    FROM menu_items mi
    LEFT JOIN order_items oi ON oi.menu_item_id = mi.id
    LEFT JOIN orders o      ON o.id = oi.order_id
                           AND o.restaurant_id = $1
                           AND o.created_at >= mi.created_at
    LEFT JOIN payments p    ON p.order_id = o.id AND p.status = 'completed'
    WHERE mi.restaurant_id = $1
      AND mi.archived_at IS NULL
      AND mi.created_at IS NOT NULL
      AND mi.created_at >= now() - make_interval(days => $2)
      AND (oi.id IS NULL OR p.id IS NOT NULL)
    GROUP BY mi.id, mi.name, mi.category, mi.created_at
    ORDER BY mi.created_at DESC
  `, [restaurantId, windowDays]).then((r) => r.rows);

/** Orders and revenue by hour of the restaurant's own local clock. */
const getHourBuckets = (restaurantId, tz, days, channel = null) =>
  db.query(`
    SELECT
      EXTRACT(HOUR FROM o.created_at AT TIME ZONE $2)::int AS hour,
      COUNT(DISTINCT o.id)::int                            AS orders,
      COALESCE(SUM(p.amount), 0)                           AS revenue
    FROM orders o
    JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
    WHERE o.restaurant_id = $1
      AND o.created_at >= now() - make_interval(days => $3)
      AND ($4::text IS NULL OR o.channel = $4)
    GROUP BY 1
    ORDER BY 1
  `, [restaurantId, tz, days, channel]).then((r) => r.rows);

/** Payment-side totals over the window — same basis as the sales summary. */
const getEconomicsTotals = (restaurantId, days) =>
  db.query(`
    SELECT
      COUNT(DISTINCT o.id)::int                   AS orders,
      COALESCE(SUM(p.amount), 0)                  AS revenue,
      COALESCE(SUM(p.subtotal), 0)                AS subtotal,
      COALESCE(SUM(p.discount_amount), 0)         AS discount,
      COALESCE(SUM(p.coupon_discount_amount), 0)  AS coupon,
      COALESCE(SUM(p.loyalty_discount_amount), 0) AS loyalty,
      COALESCE(SUM(p.tax_amount), 0)              AS tax,
      COALESCE(SUM(p.service_charge_amount), 0)   AS service_charge
    FROM orders o
    JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
    WHERE o.restaurant_id = $1
      AND o.created_at >= now() - make_interval(days => $2)
  `, [restaurantId, days]).then((r) => r.rows[0]);

/**
 * Per-coupon economics over the window: how many orders each code drove, what was
 * collected on them, what was given away, and how much of that collection came on
 * a commissioned (delivery) channel. Same completed-payment revenue basis as
 * everything else here.
 */
const getCouponEconomics = (restaurantId, days) =>
  db.query(`
    SELECT
      c.id,
      c.code,
      c.discount_type                                   AS "discountType",
      c.discount_value                                  AS "discountValue",
      COUNT(*)::int                                     AS orders,
      COALESCE(SUM(p.amount), 0)::float8                AS collected,
      COALESCE(SUM(cr.discount_amount), 0)::float8      AS discount,
      COALESCE(SUM(CASE WHEN o.channel = 'delivery' THEN p.amount ELSE 0 END), 0)::float8
                                                        AS "deliveryCollected"
    FROM coupon_redemptions cr
    JOIN orders o    ON o.id = cr.order_id AND o.restaurant_id = $1
    JOIN payments p  ON p.order_id = o.id AND p.status = 'completed'
    JOIN coupons c   ON c.id = cr.coupon_id
    WHERE cr.restaurant_id = $1
      AND o.created_at >= now() - make_interval(days => $2)
    GROUP BY c.id, c.code, c.discount_type, c.discount_value
  `, [restaurantId, days]).then((r) => r.rows);

/**
 * Average-per-cover inputs: revenue and covers over paid dining bills, split by
 * whether a guest count was captured. Covers were only just added to the billing
 * flow, so coverage travels with the figure.
 */
const getApc = (restaurantId, days) =>
  db.query(`
    WITH dining AS (
      SELECT o.id, o.covers,
             (SELECT COALESCE(SUM(p.amount), 0)
                FROM payments p WHERE p.order_id = o.id AND p.status = 'completed') AS revenue
        FROM orders o
       WHERE o.restaurant_id = $1
         AND o.channel = 'dining'
         AND o.status = 'paid'
         AND o.created_at >= now() - make_interval(days => $2)
    )
    SELECT
      COALESCE(SUM(revenue) FILTER (WHERE covers IS NOT NULL), 0)::float8 AS revenue,
      COALESCE(SUM(covers), 0)::int                                       AS covers,
      COUNT(*) FILTER (WHERE covers IS NOT NULL)::int                     AS "coveredOrders",
      COUNT(*)::int                                                       AS "diningOrders"
    FROM dining
  `, [restaurantId, days]).then((r) => r.rows[0]);

/**
 * Service-charge-removed inputs, per dining bill (grouped by order so a split
 * bill counts once). "Applicable" = a bill that either carried a service charge
 * or had one waived; "waived" = the guest declined it.
 */
const getScRemoved = (restaurantId, days) =>
  db.query(`
    WITH bills AS (
      SELECT o.id,
             BOOL_OR(p.service_charge_waived)          AS waived,
             SUM(p.service_charge_amount)              AS sc_amount,
             SUM(p.subtotal)                           AS subtotal
        FROM orders o
        JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
       WHERE o.restaurant_id = $1
         AND o.channel = 'dining'
         AND o.status = 'paid'
         AND o.created_at >= now() - make_interval(days => $2)
       GROUP BY o.id
    )
    SELECT
      COUNT(*) FILTER (WHERE waived OR sc_amount > 0)::int          AS applicable,
      COUNT(*) FILTER (WHERE waived)::int                           AS waived,
      COALESCE(SUM(subtotal) FILTER (WHERE waived), 0)::float8      AS "waivedSubtotal"
    FROM bills
  `, [restaurantId, days]).then((r) => r.rows[0]);

/** Service-charge-removed broken down by the server responsible for the bill. */
const getScRemovedByServer = (restaurantId, days) =>
  db.query(`
    WITH bills AS (
      SELECT o.id,
             COALESCE(o.assigned_staff_id, o.created_by) AS server_id,
             BOOL_OR(p.service_charge_waived)            AS waived,
             SUM(p.service_charge_amount)                AS sc_amount
        FROM orders o
        JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
       WHERE o.restaurant_id = $1
         AND o.channel = 'dining'
         AND o.status = 'paid'
         AND o.created_at >= now() - make_interval(days => $2)
       GROUP BY o.id, COALESCE(o.assigned_staff_id, o.created_by)
    )
    SELECT
      COALESCE(u.name, 'Unassigned')                      AS server,
      COUNT(*) FILTER (WHERE waived OR sc_amount > 0)::int AS applicable,
      COUNT(*) FILTER (WHERE waived)::int                  AS waived
    FROM bills b
    LEFT JOIN users u ON u.id = b.server_id
    GROUP BY COALESCE(u.name, 'Unassigned')
    HAVING COUNT(*) FILTER (WHERE waived OR sc_amount > 0) > 0
    ORDER BY waived DESC
  `, [restaurantId, days]).then((r) => r.rows);

/** The configured service-charge rate as a fraction, for the removed-value estimate. */
const getServiceChargeRate = (restaurantId) =>
  db.query(
    `SELECT value FROM settings WHERE restaurant_id = $1 AND key = 'service_charge'`,
    [restaurantId],
  ).then((r) => parseFloat(r.rows[0]?.value || '0') / 100);

/** Average contracted delivery commission (a fraction), applied to delivery redemptions. */
const getAvgCommissionRate = (restaurantId) =>
  db.query(
    `SELECT COALESCE(AVG(commission_rate), 0)::float8 AS rate
       FROM platform_contracts WHERE restaurant_id = $1`,
    [restaurantId],
  ).then((r) => Number(r.rows[0]?.rate || 0));

/**
 * Category items sold and baskets carrying each category, split into the current
 * window and the prior window of equal length, for the attach-rate delta.
 */
const getCategoryAttach = (restaurantId, days) =>
  db.query(`
    WITH paid AS (
      SELECT o.id,
        CASE
          WHEN o.created_at >= now() - make_interval(days => $2) THEN 'cur'
          ELSE 'prev'
        END AS period
      FROM orders o
      JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
      WHERE o.restaurant_id = $1
        AND o.created_at >= now() - make_interval(days => $2 * 2)
    )
    SELECT
      paid.period,
      COALESCE(mi.category, 'Uncategorised')       AS category,
      COALESCE(SUM(oi.quantity), 0)::int           AS items,
      COUNT(DISTINCT paid.id)::int                 AS "ordersWith"
    FROM paid
    JOIN order_items oi ON oi.order_id = paid.id AND oi.status IS DISTINCT FROM 'cancelled'
    JOIN menu_items mi  ON mi.id = oi.menu_item_id
    GROUP BY paid.period, COALESCE(mi.category, 'Uncategorised')
  `, [restaurantId, days]).then((r) => r.rows);

/** Paid-order counts for the current and prior windows, the attach denominator. */
const getPeriodOrderTotals = (restaurantId, days) =>
  db.query(`
    SELECT
      CASE
        WHEN o.created_at >= now() - make_interval(days => $2) THEN 'cur'
        ELSE 'prev'
      END AS period,
      COUNT(DISTINCT o.id)::int AS "totalOrders"
    FROM orders o
    JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
    WHERE o.restaurant_id = $1
      AND o.created_at >= now() - make_interval(days => $2 * 2)
    GROUP BY 1
  `, [restaurantId, days]).then((r) => r.rows);

/** Cancellations and the revenue that walked out with them. */
const getCancellationTotals = (restaurantId, days) =>
  db.query(`
    SELECT
      (SELECT COUNT(*) FROM orders
        WHERE restaurant_id = $1
          AND created_at >= now() - make_interval(days => $2))::int AS total_orders,
      (SELECT COUNT(*) FROM orders
        WHERE restaurant_id = $1 AND status = 'cancelled'
          AND created_at >= now() - make_interval(days => $2))::int AS cancelled_orders,
      (SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0)
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
        WHERE o.restaurant_id = $1 AND o.status = 'cancelled'
          AND o.created_at >= now() - make_interval(days => $2)) AS lost_revenue
  `, [restaurantId, days]).then((r) => r.rows[0]);

/**
 * Food cost of what was actually sold, counting ONLY lines whose dish has a
 * costed recipe. `items_total` says how many lines were in scope, so the UI can
 * state what share of the menu the percentage is based on instead of implying
 * it covers everything.
 */
const getFoodCostTotals = (restaurantId, days) =>
  db.query(`
    WITH lines AS (
      SELECT
        oi.quantity,
        mi.price AS unit_price,
        (
          SELECT COALESCE(SUM(ri.quantity * ri.cost_per_unit), 0)
          FROM recipe_ingredients ri
          WHERE ri.recipe_id = mi.recipe_id
        ) AS unit_cost
      FROM order_items oi
      JOIN orders o     ON o.id = oi.order_id
      JOIN payments p   ON p.order_id = o.id AND p.status = 'completed'
      JOIN menu_items mi ON mi.id = oi.menu_item_id
      WHERE o.restaurant_id = $1
        AND o.created_at >= now() - make_interval(days => $2)
        AND oi.status IS DISTINCT FROM 'cancelled'
    )
    SELECT
      COALESCE(SUM(quantity * unit_cost) FILTER (WHERE unit_cost > 0), 0)  AS food_cost,
      COALESCE(SUM(quantity * unit_price) FILTER (WHERE unit_cost > 0), 0) AS item_revenue,
      COUNT(*) FILTER (WHERE unit_cost > 0)::int                           AS items_costed,
      COUNT(*)::int                                                        AS items_total
    FROM lines
  `, [restaurantId, days]).then((r) => r.rows[0]);

/** All per-dish quantities over the span, for the menu-wide median rate. */
const getAllItemQuantities = (restaurantId, days) =>
  db.query(`
    SELECT COALESCE(SUM(oi.quantity), 0)::int AS qty
    FROM order_items oi
    JOIN orders o   ON o.id = oi.order_id
    JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
    WHERE o.restaurant_id = $1
      AND o.created_at >= now() - make_interval(days => $2)
      AND oi.status IS DISTINCT FROM 'cancelled'
    GROUP BY oi.menu_item_id
  `, [restaurantId, days]).then((r) => r.rows.map((x) => x.qty));

const getTimezone = (restaurantId) =>
  db.query(
    `SELECT value FROM settings WHERE restaurant_id = $1 AND key = 'timezone'`,
    [restaurantId],
  ).then((r) => r.rows[0]?.value || 'UTC');

/**
 * Delivery platform cost for the period, from reconciled settlement lines.
 *
 * The real cost of an aggregator order is what the platform kept: commission,
 * the taxes withheld on it (TDS/TCS), and any SLA penalty — i.e. gross minus the
 * net that actually landed. Only orders whose settlement CSV has been imported
 * appear here, so `reconciledOrders` is reported alongside the total delivery
 * orders in the period: a commission figure that silently covered half of
 * delivery would flatter the margin exactly where it hurts.
 */
const getDeliveryCostTotals = (restaurantId, days) =>
  db.query(
    `SELECT
       COALESCE(SUM(so.commission), 0)::float8                    AS commission,
       COALESCE(SUM(so.tds + so.tcs), 0)::float8                  AS taxes_withheld,
       COALESCE(SUM(so.sla_penalty), 0)::float8                   AS penalties,
       COALESCE(SUM(so.gross_amount - so.net_amount), 0)::float8  AS platform_take,
       COALESCE(SUM(so.gross_amount), 0)::float8                  AS gross,
       COUNT(*)::int                                              AS reconciled_orders
     FROM settlement_orders so
     WHERE so.restaurant_id = $1
       AND so.order_date >= (now())::date - $2::int`,
    [restaurantId, days],
  ).then((r) => r.rows[0]);

/** How many delivery orders the period actually had, for reconciliation coverage. */
const getDeliveryOrderCount = (restaurantId, days) =>
  db.query(
    `SELECT COUNT(*)::int AS n
       FROM orders
      WHERE restaurant_id = $1 AND channel = 'delivery'
        AND created_at >= now() - make_interval(days => $2)`,
    [restaurantId, days],
  ).then((r) => r.rows[0].n);

// ── Recommendation funnel (Phase 0 recsys, reads guest_events) ───────────────

/**
 * Session-level funnel counts over the window. One row of integers, each a
 * count of DISTINCT sessions reaching a stage (so a session that added three
 * dishes counts once), plus the dish-add totals that define acceptance and the
 * rejection reasons. The pure funnel builder turns these into rates.
 */
const getRecoFunnelCounts = (restaurantId, days, offsetDays = 0) =>
  db.query(`
    SELECT
      COUNT(DISTINCT session_id)                                          AS sessions,
      COUNT(DISTINCT session_id) FILTER (WHERE event = 'recommendations_shown') AS sessions_saw_recos,
      COUNT(DISTINCT session_id) FILTER (WHERE event = 'dish_added')      AS sessions_added,
      COUNT(DISTINCT session_id) FILTER (WHERE event = 'dish_added' AND source = 'reco') AS sessions_added_reco,
      COUNT(DISTINCT session_id) FILTER (WHERE event = 'order_placed')    AS sessions_ordered,
      -- Distinct (session, dish), NOT raw events: a dish added 1→2→3 fires three
      -- dish_added events, and counting them would inflate acceptance for dishes
      -- people order in multiples. seq is the fallback key when a dish id didn't
      -- resolve, so an unresolved add still counts once.
      COUNT(DISTINCT session_id || ':' || COALESCE(menu_item_id::text, seq::text))
        FILTER (WHERE event = 'dish_added')                              AS dish_adds,
      COUNT(DISTINCT session_id || ':' || COALESCE(menu_item_id::text, seq::text))
        FILTER (WHERE event = 'dish_added' AND source = 'reco')          AS dish_adds_reco,
      COUNT(*) FILTER (WHERE event = 'reco_rejected' AND props->>'reason' = 'refine') AS rejects_refine,
      COUNT(*) FILTER (WHERE event = 'reco_rejected' AND props->>'reason' = 'capped') AS rejects_capped
    FROM guest_events
    WHERE restaurant_id = $1
      AND occurred_at >= now() - make_interval(days => ($2::int + $3::int))
      AND occurred_at <  now() - make_interval(days => $3::int)
  `, [restaurantId, days, offsetDays]).then((r) => r.rows[0]);

/**
 * Per-dish reco-driven add/remove counts over the window — only events that
 * resolved to a live menu item. The margin loop joins these to the
 * menu-engineering matrix by menu_item_id.
 */
const getRecoDishStats = (restaurantId, days) =>
  db.query(`
    SELECT
      ge.menu_item_id                                                          AS menu_item_id,
      COALESCE(mi.name, MAX(ge.dish_name))                                     AS dish_name,
      -- Distinct sessions, not raw events: "how many tables added this from a
      -- pick", so quantity increments don't inflate a single table into many.
      COUNT(DISTINCT ge.session_id) FILTER (WHERE ge.event = 'dish_added')::int   AS reco_adds,
      COUNT(DISTINCT ge.session_id) FILTER (WHERE ge.event = 'dish_removed')::int AS reco_removes
    FROM guest_events ge
    LEFT JOIN menu_items mi ON mi.id = ge.menu_item_id
    WHERE ge.restaurant_id = $1
      AND ge.source = 'reco'
      AND ge.menu_item_id IS NOT NULL
      AND ge.event IN ('dish_added', 'dish_removed')
      AND ge.occurred_at >= now() - make_interval(days => $2)
    GROUP BY ge.menu_item_id, mi.name
  `, [restaurantId, days]).then((r) => r.rows);

/**
 * Per-dish impression counts — how many times each dish was actually put in
 * front of a table, unnested from `recommendations_shown` events' dishIds. This
 * is the denominator for a true impression → add conversion per dish; older
 * events with no dishIds contribute nothing (the array is simply empty), so the
 * signal grows from the moment the guest app started sending it, never guessed
 * for the rows that predate it.
 */
const getRecoImpressions = (restaurantId, days) =>
  db.query(`
    SELECT s.did                          AS menu_item_id,
           mi.name                        AS dish_name,
           -- Distinct sessions shown the dish, so two refine rounds in one visit
           -- count as one table exposed, not two impressions.
           COUNT(DISTINCT s.session_id)::int AS impressions
    FROM (
      SELECT ge.session_id, did
      FROM guest_events ge
      CROSS JOIN LATERAL jsonb_array_elements_text(
        COALESCE(ge.props->'dishIds', '[]'::jsonb)
      ) AS did
      WHERE ge.restaurant_id = $1
        AND ge.event = 'recommendations_shown'
        AND ge.occurred_at >= now() - make_interval(days => $2)
        AND did ~ '^[0-9a-fA-F-]{36}$'   -- ignore any non-UUID the client ever sends
    ) s
    -- Compare as text, never did::uuid, so a malformed id can't throw the query.
    LEFT JOIN menu_items mi ON mi.id::text = lower(s.did) AND mi.restaurant_id = $1
    GROUP BY s.did, mi.name
  `, [restaurantId, days]).then((r) => r.rows);

/**
 * How many times one dish was put in front of a table over the window — the
 * outcome metric for a "feature this dish" action. Featuring should raise this
 * (the recommender surfaces it more), so it's measurable from zero, unlike a
 * conversion rate that has no base when the dish is never shown.
 */
const getRecoImpressionsForDish = (restaurantId, days, menuItemId) =>
  db.query(`
    SELECT COUNT(DISTINCT ge.session_id)::int AS impressions
    FROM guest_events ge
    CROSS JOIN LATERAL jsonb_array_elements_text(
      COALESCE(ge.props->'dishIds', '[]'::jsonb)
    ) AS did
    WHERE ge.restaurant_id = $1
      AND ge.event = 'recommendations_shown'
      AND lower(did) = lower($3)
      AND ge.occurred_at >= now() - make_interval(days => $2)
  `, [restaurantId, days, menuItemId]).then((r) => r.rows[0].impressions);

/**
 * Revenue the recommender moved — from order_placed events' bill total and the
 * share of items that came from a pick. Numbers are parsed defensively (a bad
 * `total` becomes NULL and is excluded, `recoShare` is clamped to [0,1]) so a
 * malformed client payload can't skew or crash the aggregate.
 */
const getRecoRevenue = (restaurantId, days) =>
  db.query(`
    WITH o AS (
      SELECT
        CASE WHEN (props->>'total') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (props->>'total')::numeric END AS total,
        LEAST(GREATEST(
          COALESCE(CASE WHEN (props->>'recoShare') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (props->>'recoShare')::numeric END, 0),
        0), 1) AS share
      FROM guest_events
      WHERE restaurant_id = $1 AND event = 'order_placed'
        AND occurred_at >= now() - make_interval(days => $2)
    )
    SELECT
      COUNT(*) FILTER (WHERE total IS NOT NULL)                         AS orders,
      COALESCE(SUM(total), 0)                                           AS total_revenue,
      COALESCE(SUM(total * share), 0)                                   AS reco_revenue,
      COUNT(*) FILTER (WHERE total IS NOT NULL AND share > 0)           AS reco_orders,
      COALESCE(SUM(total) FILTER (WHERE share > 0), 0)                  AS reco_order_revenue,
      COUNT(*) FILTER (WHERE total IS NOT NULL AND share = 0)           AS nonreco_orders,
      COALESCE(SUM(total) FILTER (WHERE share = 0), 0)                  AS nonreco_order_revenue
    FROM o
  `, [restaurantId, days]).then((r) => r.rows[0]);

/**
 * The funnel split by a per-session key carried on recommendations_shown (its
 * `entry` — the occasion the table checked in as — or `partySize`). The session's
 * key is read from its recommendations_shown event, then all of that session's
 * events are attributed to it, so adds and orders line up with the segment. Only
 * sessions whose key is present are counted (older events without it simply
 * don't segment).
 */
const getRecoFunnelBySegment = (restaurantId, days, field) =>
  db.query(`
    WITH seg AS (
      SELECT DISTINCT ON (session_id) session_id, NULLIF(props->>$3, '') AS segment
      FROM guest_events
      WHERE restaurant_id = $1 AND event = 'recommendations_shown'
        AND NULLIF(props->>$3, '') IS NOT NULL
        AND occurred_at >= now() - make_interval(days => $2)
      ORDER BY session_id, seq ASC
    )
    SELECT seg.segment AS segment,
      COUNT(DISTINCT ge.session_id) FILTER (WHERE ge.event = 'recommendations_shown') AS saw,
      COUNT(DISTINCT ge.session_id) FILTER (WHERE ge.event = 'order_placed')          AS ordered,
      COUNT(DISTINCT ge.session_id || ':' || COALESCE(ge.menu_item_id::text, ge.seq::text))
        FILTER (WHERE ge.event = 'dish_added')                                        AS adds,
      COUNT(DISTINCT ge.session_id || ':' || COALESCE(ge.menu_item_id::text, ge.seq::text))
        FILTER (WHERE ge.event = 'dish_added' AND ge.source = 'reco')                 AS adds_reco
    FROM seg
    JOIN guest_events ge ON ge.session_id = seg.session_id AND ge.restaurant_id = $1
      AND ge.occurred_at >= now() - make_interval(days => $2)
    GROUP BY seg.segment
  `, [restaurantId, days, field]).then((r) => r.rows);

/**
 * Refine-loop counts: per session, whether it refined the picks (saw a round ≥ 1)
 * and whether it ordered — so the operator can see if the first picks or the
 * refined ones are what convert.
 */
const getRecoRefineStats = (restaurantId, days) =>
  db.query(`
    WITH sess AS (
      SELECT session_id,
             BOOL_OR((props->>'round') ~ '^[0-9]+$' AND (props->>'round')::int >= 1) AS refined
      FROM guest_events
      WHERE restaurant_id = $1 AND event = 'recommendations_shown'
        AND occurred_at >= now() - make_interval(days => $2)
      GROUP BY session_id
    ),
    ord AS (
      SELECT DISTINCT session_id
      FROM guest_events
      WHERE restaurant_id = $1 AND event = 'order_placed'
        AND occurred_at >= now() - make_interval(days => $2)
    )
    SELECT
      COUNT(*)                                                    AS sessions,
      COUNT(*) FILTER (WHERE s.refined)                           AS refined_sessions,
      COUNT(*) FILTER (WHERE s.refined AND o.session_id IS NOT NULL)     AS refined_ordered,
      COUNT(*) FILTER (WHERE NOT s.refined AND o.session_id IS NOT NULL) AS unrefined_ordered
    FROM sess s LEFT JOIN ord o ON o.session_id = s.session_id
  `, [restaurantId, days]).then((r) => r.rows[0]);

/**
 * How fast tables decide: the median seconds from a table being shown picks to
 * its first reco-driven add. The whole pitch is "dishes everyone agrees on in
 * under a minute" — this measures it. Only sessions where an add followed the
 * picks count; a negative or missing gap is excluded, never guessed.
 */
const getRecoTiming = (restaurantId, days) =>
  db.query(`
    WITH firsts AS (
      SELECT session_id,
             MIN(occurred_at) FILTER (WHERE event = 'recommendations_shown')             AS shown_at,
             MIN(occurred_at) FILTER (WHERE event = 'dish_added' AND source = 'reco')     AS first_add_at
      FROM guest_events
      WHERE restaurant_id = $1
        AND event IN ('recommendations_shown', 'dish_added')
        AND occurred_at >= now() - make_interval(days => $2)
      GROUP BY session_id
    )
    SELECT
      COUNT(*) FILTER (WHERE shown_at IS NOT NULL AND first_add_at IS NOT NULL AND first_add_at >= shown_at)::int AS sessions,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_add_at - shown_at)))
        FILTER (WHERE shown_at IS NOT NULL AND first_add_at IS NOT NULL AND first_add_at >= shown_at)             AS median_seconds
    FROM firsts
  `, [restaurantId, days]).then((r) => r.rows[0]);

/**
 * Catalog coverage: how many DISTINCT dishes the recommender ever put in front of
 * a table over the window, against how many available dishes there are. A
 * recommender that only ever shows a handful is starving the long tail — the
 * signal that exploration is (or isn't) doing its job.
 */
const getRecoCoverage = (restaurantId, days) =>
  db.query(`
    WITH shown AS (
      SELECT DISTINCT lower(did) AS id
      FROM guest_events ge
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(ge.props->'dishIds', '[]'::jsonb)) AS did
      WHERE ge.restaurant_id = $1 AND ge.event = 'recommendations_shown'
        AND ge.occurred_at >= now() - make_interval(days => $2)
        AND did ~ '^[0-9a-fA-F-]{36}$'
    )
    SELECT
      (SELECT COUNT(*) FROM shown s JOIN menu_items mi ON mi.id::text = s.id AND mi.restaurant_id = $1)::int AS shown_dishes,
      (SELECT COUNT(*) FROM menu_items WHERE restaurant_id = $1 AND available = true AND archived_at IS NULL)::int AS available_dishes
  `, [restaurantId, days]).then((r) => r.rows[0]);

/**
 * Per-server performance over the window — paid dine-in orders attributed to the
 * staff member who took/was assigned them (COALESCE(assigned_staff_id, created_by),
 * the same attribution the service-charge-removed breakdown uses). Revenue and
 * item counts are aggregated in separate CTEs so a split bill (two payment rows)
 * can't double-count items, and vice-versa.
 */
const getStaffPerformance = (restaurantId, days) =>
  db.query(`
    WITH so AS (
      SELECT o.id, COALESCE(o.assigned_staff_id, o.created_by) AS server_id
      FROM orders o
      WHERE o.restaurant_id = $1 AND o.channel = 'dining' AND o.status = 'paid'
        AND o.created_at >= now() - make_interval(days => $2)
        AND COALESCE(o.assigned_staff_id, o.created_by) IS NOT NULL
    ),
    ord AS (SELECT server_id, COUNT(*)::int AS orders FROM so GROUP BY server_id),
    rev AS (
      SELECT so.server_id, COALESCE(SUM(p.amount), 0)::float8 AS revenue
      FROM so JOIN payments p ON p.order_id = so.id AND p.status = 'completed'
      GROUP BY so.server_id
    ),
    itm AS (
      SELECT so.server_id, COALESCE(SUM(oi.quantity), 0)::int AS items
      FROM so JOIN order_items oi ON oi.order_id = so.id AND oi.status <> 'cancelled'
      GROUP BY so.server_id
    )
    SELECT u.id AS server_id, u.name,
           ord.orders,
           COALESCE(rev.revenue, 0) AS revenue,
           COALESCE(itm.items, 0)   AS items
    FROM ord
    JOIN users u ON u.id = ord.server_id
    LEFT JOIN rev ON rev.server_id = ord.server_id
    LEFT JOIN itm ON itm.server_id = ord.server_id
    ORDER BY revenue DESC
  `, [restaurantId, days]).then((r) => r.rows);

/**
 * Guest cohort activity: each loyalty guest's paid orders bucketed by the month
 * offset from their FIRST order, so the pure builder can draw the classic
 * retention triangle (what share of a cohort comes back in month N) and the
 * cumulative revenue-per-guest (LTV) curve. Revenue is summed in a subquery per
 * order to avoid split-bill double-counting.
 */
const getGuestCohorts = (restaurantId) =>
  db.query(`
    WITH cust_orders AS (
      SELECT o.loyalty_customer_id AS cid,
             o.created_at,
             (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.order_id = o.id AND p.status = 'completed') AS amount
      FROM orders o
      WHERE o.restaurant_id = $1 AND o.status = 'paid' AND o.loyalty_customer_id IS NOT NULL
    ),
    firsts AS (
      SELECT cid, date_trunc('month', MIN(created_at)) AS cohort FROM cust_orders GROUP BY cid
    ),
    joined AS (
      SELECT f.cohort, co.cid, co.amount,
             (EXTRACT(YEAR FROM co.created_at) - EXTRACT(YEAR FROM f.cohort)) * 12
               + (EXTRACT(MONTH FROM co.created_at) - EXTRACT(MONTH FROM f.cohort)) AS month_offset
      FROM cust_orders co JOIN firsts f ON f.cid = co.cid
    )
    SELECT to_char(cohort, 'YYYY-MM')      AS cohort,
           month_offset::int               AS month_offset,
           COUNT(DISTINCT cid)::int         AS active_guests,
           COALESCE(SUM(amount), 0)::float8 AS revenue
    FROM joined
    GROUP BY cohort, month_offset
    ORDER BY cohort, month_offset
  `, [restaurantId]).then((r) => r.rows);

/** The menu-item ids currently flagged `featured` — the operator's promote set. */
const getFeaturedMenuItemIds = (restaurantId) =>
  db.query(
    `SELECT id FROM menu_items WHERE restaurant_id = $1 AND featured = true AND archived_at IS NULL`,
    [restaurantId],
  ).then((r) => r.rows.map((x) => x.id));

module.exports = {
  getMenuPerformance, getSpanDays, getBasketLines, getNewItems, getHourBuckets,
  getEconomicsTotals, getCancellationTotals, getFoodCostTotals,
  getDeliveryCostTotals, getDeliveryOrderCount,
  getAllItemQuantities, getTimezone,
  getCouponEconomics, getAvgCommissionRate, getCategoryAttach, getPeriodOrderTotals,
  getApc, getScRemoved, getScRemovedByServer, getServiceChargeRate,
  getRecoFunnelCounts, getRecoDishStats, getRecoImpressions, getFeaturedMenuItemIds,
  getRecoImpressionsForDish, getRecoRevenue, getRecoFunnelBySegment, getRecoRefineStats,
  getRecoCoverage, getRecoTiming, getStaffPerformance, getGuestCohorts,
};
