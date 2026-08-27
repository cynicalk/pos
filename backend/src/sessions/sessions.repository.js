/*
 * sessions.repository — raw SQL for table_sessions logging + ETA running stats.
 *
 * Every function takes an explicit `client` so the whole record-and-aggregate
 * step runs inside one transaction (see sessions.service): we lock the two
 * settings stat-rows before the read-modify-write so concurrent table-frees
 * can't clobber each other's running totals.
 */

// The dining session that just ended for this table = the one whose most recent
// order is newest, excluding any session already logged. Returns null when the
// table has no orders (e.g. a reserved table released without anyone sitting) or
// the latest session is already recorded.
const getEndingSession = (client, tableId, restaurantId) =>
  client.query(
    `WITH latest AS (
       SELECT table_session_id        AS session_id,
              MIN(created_at)          AS started_at,
              MIN(requested_bill_at)   AS requested_bill_at
       FROM   orders
       WHERE  table_id = $1 AND restaurant_id = $2 AND table_session_id IS NOT NULL
       GROUP  BY table_session_id
       ORDER  BY MAX(created_at) DESC
       LIMIT  1
     )
     SELECT l.session_id, l.started_at, l.requested_bill_at,
            EXISTS (
              SELECT 1 FROM orders o
              WHERE o.table_session_id = l.session_id AND o.status = 'paid'
            ) AS any_paid
     FROM   latest l
     WHERE  NOT EXISTS (SELECT 1 FROM table_sessions ts WHERE ts.session_id = l.session_id)`,
    [tableId, restaurantId],
  ).then((r) => r.rows[0] || null);

// Non-cancelled items of the session, grouped by menu category.
const getSessionCategories = (client, sessionId, restaurantId) =>
  client.query(
    `SELECT mi.category                    AS category,
            SUM(oi.quantity)::int          AS qty,
            SUM(oi.quantity * mi.price)    AS amount
     FROM   orders o
     JOIN   order_items oi ON oi.order_id = o.id
     JOIN   menu_items  mi ON mi.id = oi.menu_item_id
     WHERE  o.table_session_id = $1 AND o.restaurant_id = $2 AND oi.status <> 'cancelled'
     GROUP  BY mi.category`,
    [sessionId, restaurantId],
  ).then((r) => r.rows);

// The waitlist party that was seated at this table for this session, if any —
// gives us party_size (a key Phase-2 signal) and a back-link. Anchored to the
// session's first order: we take the most recent seated entry at/around that
// time that ISN'T already tied to another session. The 15-min upper grace
// tolerates the case where a guest orders from the table QR just before staff
// click "Seat"; the lower bound + the NOT-EXISTS guard stop a still-'seated'
// party from a PREVIOUS sitting (or the NEXT one) from being mis-linked.
const getSeatedPartyForTable = (client, tableId, startedAt) =>
  client.query(
    `SELECT w.id, w.party_size
     FROM   waitlist w
     WHERE  w.assigned_table_id = $1 AND w.status = 'seated'
       AND  w.seated_at <= $2::timestamptz + INTERVAL '15 minutes'
       AND  w.seated_at >= $2::timestamptz - INTERVAL '6 hours'
       AND  NOT EXISTS (SELECT 1 FROM table_sessions ts WHERE ts.waitlist_id = w.id)
     ORDER  BY w.seated_at DESC
     LIMIT  1`,
    [tableId, startedAt],
  ).then((r) => r.rows[0] || null);

// Best-effort flag: was this table reserved-and-seated on the session's day?
// Refined once the waitlist links reservations to sessions explicitly.
const hadReservation = (client, tableId, restaurantId, startedAt) =>
  client.query(
    `SELECT EXISTS (
       SELECT 1 FROM reservations
       WHERE table_id = $1 AND restaurant_id = $2 AND status = 'seated'
         AND reserved_at::date = $3::date
     ) AS had`,
    [tableId, restaurantId, startedAt],
  ).then((r) => r.rows[0]?.had === true);

// Insert is idempotent via UNIQUE(session_id): a duplicate free event no-ops and
// returns undefined, so the caller knows not to double-count the stats.
const insertSession = (client, s) =>
  client.query(
    `INSERT INTO table_sessions
       (restaurant_id, table_id, session_id, waitlist_id, party_size, started_at, ended_at,
        duration_minutes, had_reservation, requested_bill_at,
        categories_ordered, item_count, total_amount, ended_reason)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(),
             EXTRACT(EPOCH FROM (NOW() - $6::timestamptz)) / 60.0, $7, $8,
             $9::jsonb, $10, $11, $12)
     ON CONFLICT (session_id) DO NOTHING
     RETURNING *`,
    [
      s.restaurantId, s.tableId, s.sessionId, s.waitlistId ?? null, s.partySize ?? null, s.startedAt,
      s.hadReservation, s.requestedBillAt ?? null,
      JSON.stringify(s.categoriesOrdered || {}), s.itemCount, s.totalAmount, s.endedReason,
    ],
  ).then((r) => r.rows[0] || null);

// Lock a single stat row and return its parsed JSON value (or null if unset /
// unparseable). FOR UPDATE serialises concurrent updates to the same stat.
const lockStat = (client, restaurantId, key) =>
  client.query(
    'SELECT value FROM settings WHERE restaurant_id = $1 AND key = $2 FOR UPDATE',
    [restaurantId, key],
  ).then((r) => {
    if (!r.rows[0]) return null;
    try { return JSON.parse(r.rows[0].value); } catch { return null; }
  });

const upsertStat = (client, restaurantId, key, valueString) =>
  client.query(
    `INSERT INTO settings (restaurant_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (restaurant_id, key) DO UPDATE SET value = $3`,
    [restaurantId, key, valueString],
  );

module.exports = {
  getEndingSession,
  getSessionCategories,
  getSeatedPartyForTable,
  hadReservation,
  insertSession,
  lockStat,
  upsertStat,
};
