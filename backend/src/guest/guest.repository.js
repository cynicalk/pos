const db = require('../shared/db');

/**
 * Data access for the guest dine-in app's /api/guest/* surface.
 *
 * The guest app addresses a restaurant by an "outlet" id and orders dishes by
 * NAME, because that is what a phone at a table naturally has — not internal
 * menu-item UUIDs. This repository owns the translation from that vocabulary to
 * the POS's ids, so the service layer can stay in the guest app's terms.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the outlet the guest surface belongs to.
 *
 * The app sends the restaurant id baked into the QR deployment. When it is
 * absent — a single-outlet deployment that never set it — we fall back to the
 * one active restaurant, which is only correct precisely because there is one.
 * We never guess between several: with more than one active outlet and no id,
 * the caller gets null and answers honestly rather than serving another
 * restaurant's menu.
 */
async function resolveOutlet(outletId) {
  if (outletId && UUID_RE.test(outletId)) {
    const { rows } = await db.query(
      `SELECT id, name FROM restaurants WHERE id = $1 AND is_active = true`,
      [outletId],
    );
    return rows[0] || null;
  }
  const { rows } = await db.query(
    `SELECT id, name FROM restaurants WHERE is_active = true ORDER BY created_at ASC LIMIT 2`,
  );
  // Exactly one active outlet → safe default. Zero or several → refuse to guess.
  return rows.length === 1 ? rows[0] : null;
}

// ── Shared table (Joined Cart) ───────────────────────────────────────────────

async function createSession(restaurantId, code, doc) {
  const { rows } = await db.query(
    `INSERT INTO guest_sessions (restaurant_id, code, doc, rev)
     VALUES ($1, $2, $3::jsonb, 0)
     RETURNING id, code`,
    [restaurantId, code, JSON.stringify(doc || {})],
  );
  return rows[0];
}

async function findSessionByCode(restaurantId, code) {
  const { rows } = await db.query(
    `SELECT id, code, doc, rev FROM guest_sessions
      WHERE restaurant_id = $1 AND code = $2`,
    [restaurantId, code],
  );
  return rows[0] || null;
}

async function updateSessionDoc(visitId, doc) {
  const { rows } = await db.query(
    `UPDATE guest_sessions
        SET doc = $2::jsonb, rev = rev + 1, updated_at = now()
      WHERE id = $1
      RETURNING id, rev`,
    [visitId, JSON.stringify(doc || {})],
  );
  return rows[0] || null;
}

async function codeExists(restaurantId, code) {
  const { rows } = await db.query(
    `SELECT 1 FROM guest_sessions WHERE restaurant_id = $1 AND code = $2`,
    [restaurantId, code],
  );
  return rows.length > 0;
}

// ── Ordering by dish name ────────────────────────────────────────────────────

/**
 * Match the dish names on a guest order to available menu items.
 *
 * Case-insensitive and trimmed, because the name travelled through a phone and
 * back. Returns both the matches (with id and price) and the names that matched
 * nothing, so the service can reject an order that references a dish no longer
 * on the menu instead of silently dropping it.
 */
async function matchDishesByName(restaurantId, names) {
  if (!names.length) return { matched: new Map(), unknown: [] };
  const { rows } = await db.query(
    `SELECT id, name, price::float8 AS price
       FROM menu_items
      WHERE restaurant_id = $1
        AND available = true AND archived_at IS NULL
        AND lower(btrim(name)) = ANY($2::text[])`,
    [restaurantId, names.map((n) => String(n).trim().toLowerCase())],
  );
  const matched = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r]));
  const unknown = names.filter((n) => !matched.has(String(n).trim().toLowerCase()));
  return { matched, unknown };
}

/**
 * Look up a table by its label, only when the label is a real table number.
 *
 * The guest app's `tableLabel` is usually its shared-table JOIN CODE (e.g.
 * "P7M5"), not a floor table number — so we match only when the label is a
 * positive integer, which is the one case it could name a physical table (a
 * per-table QR deployment). Anything else returns null and the order falls back
 * to the app table. `number` is an integer column, so we never hand it a string.
 */
async function findTableByLabel(restaurantId, label) {
  if (label === null || label === undefined) return null;
  const n = Number.parseInt(String(label), 10);
  if (!Number.isInteger(n) || String(n) !== String(label).trim()) return null;
  const { rows } = await db.query(
    `SELECT id FROM tables WHERE restaurant_id = $1 AND number = $2 LIMIT 1`,
    [restaurantId, n],
  );
  return rows[0] || null;
}

/**
 * The table that hosts orders placed through the guest app.
 *
 * A dine-in order must sit on a physical table (the POS enforces this so the
 * floor view and table analytics stay coherent). Guest-app orders are genuine
 * dine-in but arrive without a floor table number — the guest scanned a
 * reservation link, not a table QR. So each outlet gets one stable sentinel
 * table, number 900, that represents "ordered from the app". It is found once
 * and reused, which keeps the channel honestly `dining` (right revenue split)
 * without inventing a new floor table per order.
 */
const APP_TABLE_NUMBER = 900;
async function findOrCreateAppTable(restaurantId) {
  const found = await db.query(
    `SELECT id FROM tables WHERE restaurant_id = $1 AND number = $2 LIMIT 1`,
    [restaurantId, APP_TABLE_NUMBER],
  );
  if (found.rows[0]) return found.rows[0];
  const { rows } = await db.query(
    `INSERT INTO tables (restaurant_id, number, seats, status)
     VALUES ($1, $2, 4, 'available')
     ON CONFLICT (restaurant_id, number) DO UPDATE SET number = EXCLUDED.number
     RETURNING id`,
    [restaurantId, APP_TABLE_NUMBER],
  );
  return rows[0];
}

// ── Order status & receipt ───────────────────────────────────────────────────

/** An order and its item statuses, found by its human order_ref within an outlet. */
async function getOrderByRef(restaurantId, orderRef) {
  const { rows } = await db.query(
    `SELECT o.id, o.order_ref, o.status, o.created_at,
            COALESCE(json_agg(json_build_object(
              'name', COALESCE(oi.item_name, mi.name),
              'qty',  oi.quantity,
              'unit_price', COALESCE(oi.unit_price, mi.price)::float8,
              'status', oi.status
            )) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN menu_items mi  ON mi.id = oi.menu_item_id
      WHERE o.restaurant_id = $1 AND o.order_ref = $2
      GROUP BY o.id`,
    [restaurantId, orderRef],
  );
  return rows[0] || null;
}

/** Payment + settlement facts for a receipt, if any payment has been recorded. */
async function getPaymentForOrder(orderId) {
  const { rows } = await db.query(
    `SELECT method, tax_rate::float8 AS tax_rate, tax_amount::float8 AS tax_amount,
            total_charged::float8 AS total_charged, tenders, created_at
       FROM payments
      WHERE order_id = $1 AND status = 'completed'
      ORDER BY created_at DESC LIMIT 1`,
    [orderId],
  );
  return rows[0] || null;
}

async function getTaxRate(restaurantId) {
  const { rows } = await db.query(
    `SELECT value FROM settings WHERE restaurant_id = $1 AND key = 'tax_rate'`,
    [restaurantId],
  );
  return rows[0] ? Number(rows[0].value) / 100 : 0;
}

/** Record a settlement the guest declares at the table (no charge is made). */
async function recordPayment(orderId, { method, subtotal, taxRate, taxAmount, total, tip, tenders }) {
  await db.query(
    `INSERT INTO payments
       (order_id, amount, method, status, created_at, subtotal,
        tax_rate, tax_amount, total_charged, tenders)
     VALUES ($1, $2, $3, 'completed', now(), $4, $5, $6, $7, $8::jsonb)`,
    [orderId, total, method, subtotal, taxRate, taxAmount, total, JSON.stringify(tenders || null)],
  );
}

async function markOrderPaid(orderId) {
  await db.query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [orderId]);
}

async function setRequestedBillAt(orderId) {
  await db.query(
    `UPDATE orders SET requested_bill_at = now() WHERE id = $1 AND requested_bill_at IS NULL`,
    [orderId],
  );
}

// ── Feedback ─────────────────────────────────────────────────────────────────

/**
 * Insert a guest review. table_id is nullable here on purpose: the guest app's
 * feedback screen is reached from an order number, not necessarily a scanned
 * table token, so a review may have no physical table attached — unlike the
 * public /reviews path which always does.
 */
async function createReview({ restaurantId, overallRating, foodRating, serviceRating, comment }) {
  await db.query(
    `INSERT INTO reviews
       (restaurant_id, table_id, overall_rating, food_rating, service_rating, comment)
     VALUES ($1, NULL, $2, $3, $4, $5)`,
    [restaurantId, overallRating, foodRating, serviceRating, comment],
  );
}

// ── Affinities (cross-sell for the recommender) ──────────────────────────────

async function getOrderLinesForAffinities(restaurantId, days) {
  // Same source the /insights cross-sell map uses: paid orders' item lines.
  const { rows } = await db.query(
    `SELECT o.id AS order_id, COALESCE(oi.item_name, mi.name) AS item_name
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id AND oi.status <> 'cancelled'
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
      WHERE o.restaurant_id = $1
        AND o.status = 'paid'
        AND o.created_at >= now() - make_interval(days => $2)`,
    [restaurantId, days],
  );
  return rows;
}

// ── Recommendation events (Phase 0 recsys logging) ───────────────────────────

// Bulk-insert guest events, one multi-row INSERT. (restaurant_id, session_id,
// seq) is unique, so a re-sent batch — the sink retries on a dropped connection
// — inserts each event exactly once. Returns how many rows were new.
async function insertGuestEvents(rows) {
  if (!rows.length) return 0;
  const cols = 8; // per row, matching the tuple below
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * cols;
    values.push(
      `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}::jsonb, $${b + 8})`,
    );
    params.push(
      r.restaurantId,
      r.sessionId,
      r.seq,
      r.event,
      r.source,
      r.menuItemId,
      JSON.stringify(r.props || {}),
      r.occurredAt,
    );
  });
  const { rowCount } = await db.query(
    `INSERT INTO guest_events
       (restaurant_id, session_id, seq, event, source, menu_item_id, props, occurred_at)
     VALUES ${values.join(', ')}
     ON CONFLICT (restaurant_id, session_id, seq) DO NOTHING`,
    params,
  );
  return rowCount;
}

// Per-dish reco activity over the window: how often each dish was shown (unnested
// from recommendations_shown.dishIds) and how often it was added from a pick.
// Feeds the learned acceptance prior the recommender blends in.
async function getRecoDishActivity(restaurantId, days = 30) {
  const { rows } = await db.query(
    `WITH shown AS (
       SELECT did AS menu_item_id, COUNT(*)::int AS impressions
       FROM guest_events ge
       CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(ge.props->'dishIds', '[]'::jsonb)) AS did
       WHERE ge.restaurant_id = $1 AND ge.event = 'recommendations_shown'
         AND ge.occurred_at >= now() - make_interval(days => $2)
       GROUP BY did
     ),
     added AS (
       SELECT menu_item_id::text AS menu_item_id, COUNT(*)::int AS adds
       FROM guest_events
       WHERE restaurant_id = $1 AND event = 'dish_added' AND source = 'reco'
         AND menu_item_id IS NOT NULL
         AND occurred_at >= now() - make_interval(days => $2)
       GROUP BY menu_item_id
     )
     SELECT s.menu_item_id, s.impressions, COALESCE(a.adds, 0) AS adds
     FROM shown s LEFT JOIN added a ON a.menu_item_id = s.menu_item_id`,
    [restaurantId, days],
  );
  return rows;
}

// Resolves the dishIds the guest app sends (which are our menu_item ids) to the
// live rows, so ingest can store menu_item_id/dish_name and drop ids that no
// longer exist. Returns a Map id → name.
async function resolveMenuItemNames(restaurantId, ids) {
  if (!ids.length) return new Map();
  const { rows } = await db.query(
    `SELECT id, name FROM menu_items WHERE restaurant_id = $1 AND id = ANY($2::uuid[])`,
    [restaurantId, ids],
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}

module.exports = {
  UUID_RE,
  resolveOutlet,
  insertGuestEvents,
  getRecoDishActivity,
  resolveMenuItemNames,
  createSession,
  findSessionByCode,
  updateSessionDoc,
  codeExists,
  matchDishesByName,
  findTableByLabel,
  findOrCreateAppTable,
  getOrderByRef,
  getPaymentForOrder,
  getTaxRate,
  recordPayment,
  markOrderPaid,
  setRequestedBillAt,
  createReview,
  getOrderLinesForAffinities,
};
