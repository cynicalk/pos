const db = require('../shared/db');

// Every query here is tenant-scoped on restaurant_id. The rules engine reads
// broadly across orders, reviews and tables, so a missing scope would leak one
// restaurant's numbers into another's alerts.

// ── Rules ──────────────────────────────────────────────────────────────────

const listRules = (restaurantId) =>
  db.query(
    `SELECT id, rule_type, condition, severity, message_template, enabled
     FROM rules WHERE restaurant_id = $1 ORDER BY rule_type, severity`,
    [restaurantId],
  ).then((r) => r.rows);

/**
 * Seed any default rule this restaurant doesn't have yet.
 *
 * ON CONFLICT DO NOTHING against the (restaurant, type, severity) unique key,
 * so a later phase's new defaults reach existing installs without resetting
 * thresholds an operator has tuned — the source's stated intent, expressed as
 * one statement instead of a read-then-write race.
 */
const seedRules = (restaurantId, defaults) => {
  if (!defaults.length) return Promise.resolve(0);
  const values = defaults
    .map((_, i) => `($1, $${i * 4 + 2}, $${i * 4 + 3}::jsonb, $${i * 4 + 4}, $${i * 4 + 5})`)
    .join(', ');
  const params = [restaurantId];
  for (const d of defaults) {
    params.push(d.ruleType, JSON.stringify(d.condition), d.severity, d.messageTemplate);
  }
  // Wording follows the code; thresholds stay the operator's.
  //
  // This was `DO NOTHING`, and the consequence reached the screen. The
  // rank-drop template was corrected from "measured {gap_days} days apart" to
  // "measured {gap_days}" once {gap_days} began carrying its own units — but
  // every database created before that kept the old template and rendered
  // "measured 7 days apart days apart". A copy fix that only lands on databases
  // created after it is not a fix.
  //
  // `condition` and `enabled` are deliberately NOT overwritten: a tuned
  // threshold is the operator's judgement about their own restaurant, and
  // silently resetting it on the next deploy would be far worse than stale
  // copy. That distinction has a test — "re-seeding does not duplicate or reset
  // a tuned threshold" — which is what caught the first version of this change
  // overwriting the condition too.
  return db.query(
    `INSERT INTO rules (restaurant_id, rule_type, condition, severity, message_template)
     VALUES ${values}
     ON CONFLICT (restaurant_id, rule_type, severity) DO UPDATE
        SET message_template = EXCLUDED.message_template`,
    params,
  ).then((r) => r.rowCount);
};

// ── Evaluation context ─────────────────────────────────────────────────────

/** Order counts over the cancellation window. */
const getOrderStats = (restaurantId, windowDays) =>
  db.query(
    `SELECT
       COUNT(*)::int                                              AS total_orders,
       COUNT(*) FILTER (WHERE status = 'cancelled')::int           AS cancelled_orders
     FROM orders
     WHERE restaurant_id = $1
       AND created_at >= now() - make_interval(days => $2)`,
    [restaurantId, windowDays],
  ).then((r) => r.rows[0]);

/** Revenue actually collected on orders that were later cancelled, same window. */
const getCancellationLoss = (restaurantId, windowDays) =>
  db.query(
    `SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS loss
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.restaurant_id = $1
       AND o.status = 'cancelled'
       AND o.created_at >= now() - make_interval(days => $2)`,
    [restaurantId, windowDays],
  ).then((r) => Number(r.rows[0]?.loss || 0));

const getRecentReviews = (restaurantId, limit) =>
  db.query(
    `SELECT overall_rating, food_rating, service_rating
     FROM reviews WHERE restaurant_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [restaurantId, limit],
  ).then((r) => r.rows);

// Same window, but with the text and any stored classification — the review_theme
// rule reuses the reputation summary maths, which needs comment/theme/sentiment.
const getRecentReviewsWithText = (restaurantId, limit) =>
  db.query(
    `SELECT id, overall_rating, comment, theme, sentiment
     FROM reviews WHERE restaurant_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [restaurantId, limit],
  ).then((r) => r.rows);

/**
 * Occupied tables with a count of their unfinished orders.
 *
 * "Unfinished" is anything not yet paid or cancelled — a table that has ordered
 * is not stalled regardless of where the order is in the kitchen.
 */
const getSeatedTables = (restaurantId) =>
  db.query(
    `SELECT t.id, t.number, t.occupied_at,
            (SELECT COUNT(*) FROM orders o
              WHERE o.table_id = t.id
                AND o.status NOT IN ('paid','cancelled'))::int AS open_order_count
     FROM tables t
     WHERE t.restaurant_id = $1 AND t.status = 'occupied'`,
    [restaurantId],
  ).then((r) => r.rows);

// ── Actions ────────────────────────────────────────────────────────────────

/**
 * Dedupe keys that must not be raised again right now.
 *
 * The source suppressed only `open` and `acknowledged`, which means an action
 * the operator resolved comes straight back on the next pass — observed in
 * testing: a stalled-table alert marked "I acted on this" reappeared fifteen
 * minutes later, and dismissing it would have done the same. An alert queue
 * that re-raises what you just answered stops being read.
 *
 * So: unresolved actions suppress indefinitely, and resolved ones (acted_on or
 * dismissed) suppress for a cooldown. The cooldown rather than "forever" is
 * what keeps a standing condition — a cancellation rate that is still bad
 * tomorrow — able to speak up again, while a one-off nudge keyed per occurrence
 * simply never recurs.
 */
const findSuppressedDedupeKeys = (restaurantId, keys, cooldownHours) => {
  if (!keys.length) return Promise.resolve([]);
  return db.query(
    `SELECT DISTINCT dedupe_key FROM actions
     WHERE restaurant_id = $1
       AND dedupe_key = ANY($2::text[])
       AND (
         status IN ('open','acknowledged')
         OR (status IN ('acted_on','dismissed')
             AND resolved_at > now() - make_interval(hours => $3))
       )`,
    [restaurantId, keys, cooldownHours],
  ).then((r) => r.rows.map((x) => x.dedupe_key));
};

const createAction = (restaurantId, a) =>
  db.query(
    `INSERT INTO actions
       (restaurant_id, rule_id, action_type, dedupe_key, title, description, priority, delivered_via)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [restaurantId, a.ruleId || null, a.actionType, a.dedupeKey,
     a.title, a.description, a.priority, a.deliveredVia || 'dashboard'],
  ).then((r) => r.rows[0]);

const listActions = (restaurantId, status) =>
  db.query(
    `SELECT a.*, r.rule_type,
            u.name AS assigned_to_name,
            o.verdict, o.delta_pct, o.metric_name, o.before_value, o.after_value
     FROM actions a
     LEFT JOIN rules r    ON r.id = a.rule_id
     LEFT JOIN users u    ON u.id = a.assigned_to_id
     LEFT JOIN outcomes o ON o.action_id = a.id
     WHERE a.restaurant_id = $1
       AND ($2::text IS NULL OR a.status = $2)
     ORDER BY a.created_at DESC
     LIMIT 200`,
    [restaurantId, status || null],
  ).then((r) => r.rows);

const getAction = (id, restaurantId) =>
  db.query(
    `SELECT a.*, r.rule_type FROM actions a
     LEFT JOIN rules r ON r.id = a.rule_id
     WHERE a.id = $1 AND a.restaurant_id = $2`,
    [id, restaurantId],
  ).then((r) => r.rows[0]);

/**
 * Move an action's status, stamping the matching timestamp.
 * Scoped by restaurant_id so an id from another tenant simply doesn't match.
 */
const updateStatus = (id, restaurantId, status) =>
  db.query(
    // Every use of $3 is cast to text. Postgres deduces a single type per
    // parameter across the statement, so an uncast `status = $3` types it
    // varchar and then conflicts with the text comparisons below —
    // "inconsistent types deduced for parameter $3". Same trap as
    // tables.repository.updateStatus.
    `UPDATE actions
     SET status = $3::text,
         acknowledged_at = CASE WHEN $3::text = 'acknowledged' AND acknowledged_at IS NULL
                                THEN now() ELSE acknowledged_at END,
         resolved_at     = CASE WHEN $3::text IN ('acted_on','dismissed')
                                THEN now() ELSE NULL END
     WHERE id = $1 AND restaurant_id = $2
     RETURNING *`,
    [id, restaurantId, status],
  ).then((r) => r.rows[0]);

const assign = (id, restaurantId, userId) =>
  db.query(
    `UPDATE actions SET assigned_to_id = $3
     WHERE id = $1 AND restaurant_id = $2 RETURNING *`,
    [id, restaurantId, userId],
  ).then((r) => r.rows[0]);

// ── Outcomes ───────────────────────────────────────────────────────────────

const createOutcome = (restaurantId, actionId, metricName, beforeValue) =>
  db.query(
    `INSERT INTO outcomes (restaurant_id, action_id, metric_name, before_value)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (action_id) DO NOTHING
     RETURNING *`,
    [restaurantId, actionId, metricName, beforeValue],
  ).then((r) => r.rows[0] || null);

const getOutcomeByAction = (actionId, restaurantId) =>
  db.query(
    `SELECT * FROM outcomes WHERE action_id = $1 AND restaurant_id = $2`,
    [actionId, restaurantId],
  ).then((r) => r.rows[0]);

const recordMeasurement = (id, restaurantId, afterValue, deltaPct, verdict) =>
  db.query(
    `UPDATE outcomes
     SET after_value = $3, delta_pct = $4, verdict = $5, measured_at = now()
     WHERE id = $1 AND restaurant_id = $2
     RETURNING *`,
    [id, restaurantId, afterValue, deltaPct, verdict],
  ).then((r) => r.rows[0]);

/** Outcomes with a baseline but no measurement yet, older than `minAgeHours`.
 *  The action's dedupe_key comes along so a per-entity metric (a coupon, a
 *  category, a theme) is re-measured for the same entity it was baselined on. */
const findUnmeasuredOutcomes = (minAgeHours) =>
  db.query(
    `SELECT o.id, o.restaurant_id, o.action_id, o.metric_name, o.before_value,
            a.dedupe_key
     FROM outcomes o
     JOIN actions a ON a.id = o.action_id
     WHERE o.measured_at IS NULL
       AND o.before_value IS NOT NULL
       AND o.created_at <= now() - make_interval(hours => $1)`,
    [minAgeHours],
  ).then((r) => r.rows);

const listActiveRestaurants = () =>
  db.query(`SELECT id FROM restaurants WHERE is_active IS NOT false`)
    .then((r) => r.rows.map((x) => x.id));

module.exports = {
  listRules, seedRules,
  getOrderStats, getCancellationLoss, getRecentReviews, getRecentReviewsWithText, getSeatedTables,
  findSuppressedDedupeKeys, createAction, listActions, getAction, updateStatus, assign,
  createOutcome, getOutcomeByAction, recordMeasurement, findUnmeasuredOutcomes,
  listActiveRestaurants,
};
