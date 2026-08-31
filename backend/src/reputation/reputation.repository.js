const db = require('../shared/db');

/*
 * Reputation data access (MERGE_PLAN.md Phase 6) — reviews classification,
 * reply drafts, search ranks, competitor ratings, and the guest rollup that
 * repeat rate and winback run on.
 *
 * Every read is scoped by restaurant_id in the WHERE clause, never by trusting
 * an id the caller handed in. A review carries a named guest's words and their
 * phone number; an unscoped lookup by id would hand both to whoever posted the
 * id — the same mistake the source's findFirst-not-findUnique comment guarded
 * against.
 */

// ── Reviews ────────────────────────────────────────────────────────────────

const REVIEW_COLUMNS = `
  r.id, r.overall_rating, r.food_rating, r.service_rating, r.comment,
  r.created_at, r.customer_phone, r.loyalty_customer_id,
  r.theme, r.sentiment, r.classified_at, r.classified_by,
  t.number AS table_number,
  lc.name  AS customer_name`;

/** Reviews in a rolling window, newest first. */
const listForWindow = (restaurantId, days) =>
  db.query(
    `SELECT ${REVIEW_COLUMNS}
     FROM reviews r
     LEFT JOIN tables            t  ON t.id  = r.table_id
     LEFT JOIN loyalty_customers lc ON lc.id = r.loyalty_customer_id
     WHERE r.restaurant_id = $1
       AND r.created_at >= now() - ($2::int * INTERVAL '1 day')
     ORDER BY r.created_at DESC`,
    [restaurantId, days],
  ).then((r) => r.rows);

/** One review, scoped. Returns undefined for another restaurant's id. */
const getById = (restaurantId, reviewId) =>
  db.query(
    `SELECT ${REVIEW_COLUMNS}
     FROM reviews r
     LEFT JOIN tables            t  ON t.id  = r.table_id
     LEFT JOIN loyalty_customers lc ON lc.id = r.loyalty_customer_id
     WHERE r.restaurant_id = $1 AND r.id = $2`,
    [restaurantId, reviewId],
  ).then((r) => r.rows[0]);

/** The classifier's work queue: reviews with no theme yet, oldest first. */
const listUnclassified = (restaurantId, limit) =>
  db.query(
    `SELECT id, overall_rating, comment, created_at
     FROM reviews
     WHERE restaurant_id = $1 AND theme IS NULL
     ORDER BY created_at ASC
     LIMIT $2`,
    [restaurantId, limit],
  ).then((r) => r.rows);

/**
 * Write a classification back.
 *
 * The `theme IS NULL` guard makes this idempotent under concurrency: two
 * classifier passes racing over the same review leave the first result standing
 * rather than letting the slower one overwrite the answer already on screen.
 */
const setClassification = (restaurantId, reviewId, { theme, sentiment, classifiedBy }) =>
  db.query(
    `UPDATE reviews
        SET theme = $3, sentiment = $4, classified_by = $5, classified_at = now()
      WHERE restaurant_id = $1 AND id = $2 AND theme IS NULL
      RETURNING id`,
    [restaurantId, reviewId, theme, sentiment, classifiedBy],
  ).then((r) => r.rows[0] || null);

// ── Semantic search embeddings ─────────────────────────────────────────────

/** Reviews with a comment but no (current-model) embedding yet — the index queue. */
const listUnembedded = (restaurantId, model, limit) =>
  db.query(
    `SELECT r.id, r.comment
       FROM reviews r
       LEFT JOIN review_embeddings e ON e.review_id = r.id AND e.model = $2
      WHERE r.restaurant_id = $1
        AND r.comment IS NOT NULL AND btrim(r.comment) <> ''
        AND e.review_id IS NULL
      ORDER BY r.created_at DESC
      LIMIT $3`,
    [restaurantId, model, limit],
  ).then((r) => r.rows);

/** Upsert one review's vector (overwrites on a re-embed). */
const upsertEmbedding = (restaurantId, reviewId, embedding, model) =>
  db.query(
    `INSERT INTO review_embeddings (review_id, restaurant_id, embedding, model)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (review_id) DO UPDATE
       SET embedding = EXCLUDED.embedding, model = EXCLUDED.model, created_at = now()`,
    [reviewId, restaurantId, JSON.stringify(embedding), model],
  );

/** Every stored vector for a restaurant (current model), with the review it's for. */
const listEmbeddingsWithReviews = (restaurantId, model, days) =>
  db.query(
    `SELECT r.id, r.overall_rating, r.comment, r.theme, r.sentiment, r.created_at,
            e.embedding
       FROM review_embeddings e
       JOIN reviews r ON r.id = e.review_id
      WHERE e.restaurant_id = $1 AND e.model = $2
        AND ($3::int IS NULL OR r.created_at >= now() - make_interval(days => $3))`,
    [restaurantId, model, days ?? null],
  ).then((r) => r.rows);

/** Restaurants with unclassified reviews — the scheduler's fan-out list. */
const restaurantsWithUnclassified = () =>
  db.query('SELECT DISTINCT restaurant_id FROM reviews WHERE theme IS NULL')
    .then((r) => r.rows.map((row) => row.restaurant_id));

/** Own average across ALL reviews, for the benchmark. */
const getOwnRating = (restaurantId) =>
  db.query(
    `SELECT AVG(overall_rating)::numeric(3,2) AS avg_rating, COUNT(*)::int AS review_count
     FROM reviews WHERE restaurant_id = $1`,
    [restaurantId],
  ).then((r) => r.rows[0]);

// ── Reply drafts ───────────────────────────────────────────────────────────

const getReply = (restaurantId, reviewId) =>
  db.query(
    'SELECT * FROM review_replies WHERE restaurant_id = $1 AND review_id = $2',
    [restaurantId, reviewId],
  ).then((r) => r.rows[0]);

/**
 * Upsert the draft.
 *
 * Redrafting deliberately clears marked_sent_at: the message the operator said
 * they sent is not the message now on screen, and leaving the flag set would
 * show "sent" against text that was never sent.
 */
const upsertReply = (restaurantId, reviewId, { draft, source, userId }) =>
  db.query(
    `INSERT INTO review_replies (restaurant_id, review_id, draft, source, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (review_id) DO UPDATE
       SET draft = EXCLUDED.draft,
           source = EXCLUDED.source,
           updated_at = now(),
           marked_sent_at = NULL,
           marked_sent_by = NULL
     RETURNING *`,
    [restaurantId, reviewId, draft, source, userId || null],
  ).then((r) => r.rows[0]);

const markReplySent = (restaurantId, reviewId, userId) =>
  db.query(
    `UPDATE review_replies
        SET marked_sent_at = now(), marked_sent_by = $3
      WHERE restaurant_id = $1 AND review_id = $2
      RETURNING *`,
    [restaurantId, reviewId, userId || null],
  ).then((r) => r.rows[0]);

const listReplies = (restaurantId, reviewIds) => {
  if (!reviewIds.length) return Promise.resolve([]);
  return db.query(
    'SELECT * FROM review_replies WHERE restaurant_id = $1 AND review_id = ANY($2::uuid[])',
    [restaurantId, reviewIds],
  ).then((r) => r.rows);
};

// ── Search ranks ───────────────────────────────────────────────────────────

const listRanks = (restaurantId) =>
  db.query(
    `SELECT id, platform, query, position, total_results, recorded_at
     FROM search_ranks WHERE restaurant_id = $1
     ORDER BY recorded_at ASC`,
    [restaurantId],
  ).then((r) => r.rows);

const insertRank = (restaurantId, {
  platform, query, position, totalResults, userId,
}) =>
  db.query(
    `INSERT INTO search_ranks
       (restaurant_id, platform, query, position, total_results, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [restaurantId, platform, query, position, totalResults ?? null, userId || null],
  ).then((r) => r.rows[0]);

const deleteRank = (restaurantId, id) =>
  db.query(
    'DELETE FROM search_ranks WHERE restaurant_id = $1 AND id = $2 RETURNING id',
    [restaurantId, id],
  ).then((r) => r.rows[0] || null);

// ── Competitor ratings ─────────────────────────────────────────────────────

const listCompetitorRatings = (restaurantId) =>
  db.query(
    `SELECT id, competitor_name, platform, rating, recorded_at
     FROM competitor_ratings WHERE restaurant_id = $1
     ORDER BY recorded_at DESC`,
    [restaurantId],
  ).then((r) => r.rows);

const insertCompetitorRating = (restaurantId, {
  competitorName, platform, rating, userId,
}) =>
  db.query(
    `INSERT INTO competitor_ratings
       (restaurant_id, competitor_name, platform, rating, recorded_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [restaurantId, competitorName, platform, rating, userId || null],
  ).then((r) => r.rows[0]);

const deleteCompetitorRating = (restaurantId, id) =>
  db.query(
    'DELETE FROM competitor_ratings WHERE restaurant_id = $1 AND id = $2 RETURNING id',
    [restaurantId, id],
  ).then((r) => r.rows[0] || null);

// ── Guests (repeat rate / winback) ─────────────────────────────────────────

/*
 * Guests come from loyalty_customers joined through orders. There is no guest
 * table and no visit table — see modules/guests/repeat.js for what that limits.
 *
 * A "visit" is a distinct paid order, not a distinct day: two orders on one
 * evening are two rows in `orders`, and the POS has nothing that groups them
 * into a sitting. Counting DISTINCT date instead would be a different wrong
 * answer (a guest who genuinely came at lunch AND dinner would count once), so
 * the honest choice is the one that matches what the column actually holds.
 *
 * Only paid orders count: a cancelled order is not a visit that earned
 * anything, and including it would inflate both the visit count and the spend.
 *
 * Spend comes from SUM(payments.amount) WHERE payments.status = 'completed' —
 * `orders` has no total column, and this is the same definition that Phase 0
 * pinned for snapshot revenue and that reports.getDailySummary uses. Guest
 * spend summed a different way would not add up to the day's takings, and the
 * first person to notice would be right to stop trusting both numbers.
 *
 * The payments sum is a subquery rather than a second JOIN: joining orders and
 * payments together multiplies the order rows by their payments, and a split
 * bill would then count as two visits.
 */
const getGuestRollup = (restaurantId, windowDays) =>
  db.query(
    `SELECT lc.id             AS customer_id,
            lc.phone,
            lc.name,
            COUNT(o.id)::int  AS visits,
            MIN(o.created_at) AS first_visit,
            MAX(o.created_at) AS last_visit,
            COALESCE(SUM(
              (SELECT COALESCE(SUM(p.amount), 0)
                 FROM payments p
                WHERE p.order_id = o.id AND p.status = 'completed')
            ), 0)::numeric AS total_spend
       FROM loyalty_customers lc
       JOIN orders o
         ON o.loyalty_customer_id = lc.id
        AND o.restaurant_id       = lc.restaurant_id
        AND o.status              = 'paid'
        AND o.created_at >= now() - ($2::int * INTERVAL '1 day')
      WHERE lc.restaurant_id = $1
      GROUP BY lc.id, lc.phone, lc.name`,
    [restaurantId, windowDays],
  ).then((r) => r.rows);

/**
 * Every identified guest's paid-order timestamps, for cadence-based churn.
 *
 * Same "visit = paid order" and same payments-subquery-for-spend definitions as
 * getGuestRollup, so the two never disagree about a guest's history. Windowed
 * long (a year) rather than to the page's repeat-rate window: a guest who has
 * churned stopped ordering weeks ago, and a 90-day window would drop exactly the
 * lapsed guests the churn view exists to find. Only guests with at least a
 * couple of orders are returned — one order has no cadence to measure.
 */
const getGuestOrderHistory = (restaurantId, windowDays) =>
  db.query(
    `SELECT lc.id                              AS customer_id,
            lc.phone,
            lc.name,
            array_agg(o.created_at ORDER BY o.created_at) AS order_dates,
            COALESCE(SUM(
              (SELECT COALESCE(SUM(p.amount), 0)
                 FROM payments p
                WHERE p.order_id = o.id AND p.status = 'completed')
            ), 0)::numeric AS total_spend
       FROM loyalty_customers lc
       JOIN orders o
         ON o.loyalty_customer_id = lc.id
        AND o.restaurant_id       = lc.restaurant_id
        AND o.status              = 'paid'
        AND o.created_at >= now() - ($2::int * INTERVAL '1 day')
      WHERE lc.restaurant_id = $1
      GROUP BY lc.id, lc.phone, lc.name
      HAVING COUNT(o.id) >= 2`,
    [restaurantId, windowDays],
  ).then((r) => r.rows);

/** How much of the floor the guest metrics actually describe. */
const getIdentificationCoverage = (restaurantId, windowDays) =>
  db.query(
    `SELECT COUNT(*)::int                     AS total_orders,
            COUNT(loyalty_customer_id)::int   AS identified_orders
       FROM orders
      WHERE restaurant_id = $1
        AND status = 'paid'
        AND created_at >= now() - ($2::int * INTERVAL '1 day')`,
    [restaurantId, windowDays],
  ).then((r) => r.rows[0]);

const getRestaurantName = (restaurantId) =>
  db.query('SELECT name FROM restaurants WHERE id = $1', [restaurantId])
    .then((r) => r.rows[0]?.name || null);

module.exports = {
  listForWindow,
  getById,
  listUnclassified,
  setClassification,
  listUnembedded,
  upsertEmbedding,
  listEmbeddingsWithReviews,
  restaurantsWithUnclassified,
  getOwnRating,
  getReply,
  upsertReply,
  markReplySent,
  listReplies,
  listRanks,
  insertRank,
  deleteRank,
  listCompetitorRatings,
  insertCompetitorRating,
  deleteCompetitorRating,
  getGuestRollup,
  getGuestOrderHistory,
  getIdentificationCoverage,
  getRestaurantName,
};
