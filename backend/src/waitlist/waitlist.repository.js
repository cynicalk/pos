const db = require('../shared/db');

const create = (e) =>
  db.query(
    `INSERT INTO waitlist
       (restaurant_id, guest_name, guest_phone, whatsapp_opt_in, party_size, allow_extra_chair, prefs, assigned_table_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
     RETURNING *`,
    [
      e.restaurantId, e.guestName, e.guestPhone || null, !!e.whatsappOptIn,
      e.partySize, !!e.allowExtraChair, JSON.stringify(e.prefs || {}),
      e.assignedTableId || null, e.status || 'waiting',
    ],
  ).then((r) => r.rows[0]);

const getById = (id, restaurantId) =>
  db.query('SELECT * FROM waitlist WHERE id = $1 AND restaurant_id = $2', [id, restaurantId])
    .then((r) => r.rows[0]);

// Public: a guest polls by their entry token (no restaurant scoping needed —
// the token itself is the capability).
const getByToken = (token) =>
  db.query('SELECT * FROM waitlist WHERE public_token = $1', [token])
    .then((r) => r.rows[0]);

// The live queue in priority order (reservations are held separately via the
// ETA reservation-block; within the walk-in queue, first-come-first-served).
const getActiveQueue = (restaurantId) =>
  db.query(
    `SELECT * FROM waitlist
     WHERE restaurant_id = $1 AND status = 'waiting'
     ORDER BY joined_at ASC`,
    [restaurantId],
  ).then((r) => r.rows);

// Staff view: everyone still active or recently resolved today.
const getAll = (restaurantId) =>
  db.query(
    `SELECT * FROM waitlist
     WHERE restaurant_id = $1
       AND (status = 'waiting' OR updated_at >= NOW() - INTERVAL '6 hours')
     ORDER BY (status = 'waiting') DESC, joined_at ASC`,
    [restaurantId],
  ).then((r) => r.rows);

const setStatus = (id, restaurantId, status, extra = {}) => {
  // Optional one-shot timestamp columns set alongside the status change.
  const sets = ['status = $3', 'updated_at = NOW()'];
  const params = [id, restaurantId, status];
  if (extra.seatedAt)        { params.push(extra.assignedTableId || null); sets.push(`assigned_table_id = $${params.length}`); sets.push('seated_at = NOW()'); }
  if (extra.notifiedReady)   { sets.push('notified_ready_at = NOW()'); }
  return db.query(
    `UPDATE waitlist SET ${sets.join(', ')} WHERE id = $1 AND restaurant_id = $2 RETURNING *`,
    params,
  ).then((r) => r.rows[0]);
};

const setEstimate = (id, minutes) =>
  db.query('UPDATE waitlist SET estimated_wait_minutes = $2, updated_at = NOW() WHERE id = $1', [id, minutes]);

module.exports = { create, getById, getByToken, getActiveQueue, getAll, setStatus, setEstimate };
