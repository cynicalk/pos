const db = require('../shared/db');

/*
 * Outbound message data access. One insert path (every caller enqueues through
 * the service), and read paths for the outbox screen.
 */

const enqueue = (restaurantId, { channel, kind, recipient, recipientName, body, refId, status, statusReason }) =>
  db.query(
    `INSERT INTO outbound_messages
       (restaurant_id, channel, kind, recipient, recipient_name, body, ref_id, status, status_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, status, created_at`,
    [restaurantId, channel || 'whatsapp', kind, recipient, recipientName || null,
      body, refId || null, status || 'queued', statusReason || null],
  ).then((r) => r.rows[0]);

const list = (restaurantId, { status = null, limit = 200 } = {}) =>
  db.query(
    `SELECT id, channel, kind, recipient, recipient_name, body, ref_id,
            status, status_reason, created_at, sent_at
       FROM outbound_messages
      WHERE restaurant_id = $1
        AND ($2::text IS NULL OR status = $2)
      ORDER BY created_at DESC
      LIMIT $3`,
    [restaurantId, status, limit],
  ).then((r) => r.rows);

const counts = (restaurantId) =>
  db.query(
    `SELECT status, COUNT(*)::int AS n
       FROM outbound_messages
      WHERE restaurant_id = $1
      GROUP BY status`,
    [restaurantId],
  ).then((r) => r.rows);

module.exports = { enqueue, list, counts };
