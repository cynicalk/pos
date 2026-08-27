const db = require('../shared/db');
const { buildUpdateSet } = require('../shared/sql');

const BASE_SELECT = `
  SELECT r.*,
         t.number AS table_number,
         t.seats  AS table_seats
  FROM reservations r
  LEFT JOIN tables t ON t.id = r.table_id
`;

const getAll = (restaurantId, { date, status, tz = 'UTC' } = {}) => {
  const params = [restaurantId];
  let where = 'WHERE r.restaurant_id = $1';
  if (date) {
    // Match by calendar day in the restaurant's timezone — a reservation at,
    // say, 00:30 local would otherwise compare under the previous UTC date.
    params.push(tz);
    const tzIdx = params.length;
    params.push(date);
    where += ` AND (r.reserved_at AT TIME ZONE $${tzIdx})::date = $${params.length}::date`;
  }
  if (status) {
    params.push(status);
    where += ` AND r.status = $${params.length}`;
  }
  return db.query(`${BASE_SELECT} ${where} ORDER BY r.reserved_at ASC`, params).then((r) => r.rows);
};

const getById = (id, restaurantId) =>
  db.query('SELECT * FROM reservations WHERE id = $1 AND restaurant_id = $2', [id, restaurantId])
    .then((r) => r.rows[0]);

const create = ({ restaurantId, tableId, guestName, guestPhone, partySize, reservedAt, notes }) =>
  db.query(
    `INSERT INTO reservations (restaurant_id, table_id, guest_name, guest_phone, party_size, reserved_at, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [restaurantId, tableId || null, guestName, guestPhone || null, partySize || null, reservedAt, notes || null],
  ).then((r) => r.rows[0]);

const update = (id, restaurantId, fields) => {
  // A key present in `fields` updates its column (a nullish value clears it);
  // an absent key leaves the column untouched.
  const col = (key) => (key in fields ? (fields[key] ?? null) : undefined);
  const { clause, values } = buildUpdateSet({
    guest_name:  col('guestName'),
    guest_phone: col('guestPhone'),
    party_size:  col('partySize'),
    reserved_at: col('reservedAt'),
    notes:       col('notes'),
    table_id:    col('tableId'),
    status:      col('status'),
  }, 3);
  if (!clause) return getById(id, restaurantId);
  return db.query(
    `UPDATE reservations SET ${clause} WHERE id = $1 AND restaurant_id = $2 RETURNING *`,
    [id, restaurantId, ...values],
  ).then((r) => r.rows[0]);
};

const remove = (id, restaurantId) =>
  db.query('DELETE FROM reservations WHERE id = $1 AND restaurant_id = $2 RETURNING *', [id, restaurantId])
    .then((r) => r.rows[0]);

module.exports = { getAll, getById, create, update, remove };
