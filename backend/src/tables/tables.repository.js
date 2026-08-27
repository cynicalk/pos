const db = require('../shared/db');

const getAll = (restaurantId) =>
  db
    .query(
      `SELECT t.*, u.id AS assigned_staff_id, u.email AS assigned_staff_email, u.name AS assigned_staff_name
       FROM tables t
       LEFT JOIN users u ON u.id = t.assigned_staff_id
       WHERE t.restaurant_id = $1 ORDER BY t.number`,
      [restaurantId],
    )
    .then((r) => r.rows);

const getById = (id, restaurantId) =>
  db
    .query('SELECT * FROM tables WHERE id = $1 AND restaurant_id = $2', [id, restaurantId])
    .then((r) => r.rows[0]);

const getByStatus = (status, restaurantId) =>
  db
    .query(
      'SELECT * FROM tables WHERE status = $1 AND restaurant_id = $2 ORDER BY number',
      [status, restaurantId],
    )
    .then((r) => r.rows);

const create = ({ number, seats, restaurantId }) =>
  db
    .query(
      'INSERT INTO tables (number, seats, status, restaurant_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [number, seats, 'available', restaurantId],
    )
    .then((r) => r.rows[0]);

const updateStatus = (id, status, restaurantId, reservation = null) => {
  if (status === 'reserved' && reservation) {
    return db.query(
      `UPDATE tables
       SET status = $1,
           reservation_name  = $4,
           reservation_time  = $5,
           reservation_notes = $6,
           reservation_party = $7,
           occupied_at       = NULL
       WHERE id = $2 AND restaurant_id = $3 RETURNING *`,
      [status, id, restaurantId,
       reservation.name  || null,
       reservation.time  || null,
       reservation.notes || null,
       reservation.party || null],
    ).then((r) => r.rows[0]);
  }
  return db.query(
    `UPDATE tables
     SET status = $1::text,
         reservation_name  = NULL,
         reservation_time  = NULL,
         reservation_notes = NULL,
         reservation_party = NULL,
         -- When this party sat down (migration 074), for the stalled_table rule.
         -- Stamped only on the transition INTO 'occupied', so re-marking an
         -- already-occupied table doesn't restart its clock and hide a stall.
         -- Cleared on every other status so a new party gets a fresh timer.
         -- BOTH uses of $1 must be cast to text. Postgres deduces one type per
         -- parameter across the whole statement: an uncast status = $1 types it
         -- varchar, which then conflicts with the text comparison below and
         -- fails with "inconsistent types deduced for parameter $1". Casting
         -- only the comparison is not enough — the assignment above carries the
         -- matching ::text for the same reason.
         occupied_at = CASE
           WHEN $1::text = 'occupied' THEN COALESCE(occupied_at, now())
           ELSE NULL
         END
     WHERE id = $2 AND restaurant_id = $3 RETURNING *`,
    [status, id, restaurantId],
  ).then((r) => r.rows[0]);
};

const updatePosition = (id, x, y, restaurantId) =>
  db
    .query(
      'UPDATE tables SET x_pos = $1, y_pos = $2 WHERE id = $3 AND restaurant_id = $4 RETURNING *',
      [x ?? null, y ?? null, id, restaurantId],
    )
    .then((r) => r.rows[0]);

const remove = (id, restaurantId) =>
  db
    .query('DELETE FROM tables WHERE id = $1 AND restaurant_id = $2 RETURNING *', [id, restaurantId])
    .then((r) => r.rows[0]);

const assignStaff = (id, staffId, restaurantId) =>
  db
    .query(
      'UPDATE tables SET assigned_staff_id = $1 WHERE id = $2 AND restaurant_id = $3 RETURNING *',
      [staffId, id, restaurantId],
    )
    .then((r) => r.rows[0]);

module.exports = { getAll, getById, getByStatus, create, updateStatus, updatePosition, remove, assignStaff };
