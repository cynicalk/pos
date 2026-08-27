const db = require('../shared/db');

const listShifts = (restaurantId, from, to) =>
  db.query(`
    SELECT s.*, u.name AS staff_name, u.email AS staff_email
    FROM staff_shifts s
    JOIN users u ON u.id = s.user_id
    WHERE s.restaurant_id = $1
      AND ($2::date IS NULL OR s.work_date >= $2::date)
      AND ($3::date IS NULL OR s.work_date <= $3::date)
    ORDER BY s.work_date DESC, s.created_at DESC
    LIMIT 500
  `, [restaurantId, from || null, to || null]).then((r) => r.rows);

/** Completed shifts over a rolling window — the input to labour cost. */
const getWorkedShifts = (restaurantId, days) =>
  db.query(`
    SELECT hours, hourly_rate
    FROM staff_shifts
    WHERE restaurant_id = $1
      AND status = 'completed'
      AND hours IS NOT NULL
      AND work_date >= (now() - make_interval(days => $2))::date
  `, [restaurantId, days]).then((r) => r.rows);

const createShift = (restaurantId, { userId, workDate, hours, hourlyRate, status }) =>
  db.query(
    `INSERT INTO staff_shifts (restaurant_id, user_id, work_date, hours, hourly_rate, status)
     VALUES ($1, $2, $3::date, $4, $5, COALESCE($6, 'completed')) RETURNING *`,
    [restaurantId, userId, workDate, hours ?? null, hourlyRate, status ?? null],
  ).then((r) => r.rows[0]);

const clockIn = (restaurantId, { userId, hourlyRate }) =>
  db.query(
    `INSERT INTO staff_shifts
       (restaurant_id, user_id, work_date, hourly_rate, clock_in_at, status)
     VALUES ($1, $2, CURRENT_DATE, $3, now(), 'active') RETURNING *`,
    [restaurantId, userId, hourlyRate],
  ).then((r) => r.rows[0]);

const getActiveShift = (restaurantId, userId) =>
  db.query(
    `SELECT * FROM staff_shifts
     WHERE restaurant_id = $1 AND user_id = $2 AND status = 'active'`,
    [restaurantId, userId],
  ).then((r) => r.rows[0]);

const closeShift = (id, restaurantId, hours) =>
  db.query(
    `UPDATE staff_shifts
     SET clock_out_at = now(), hours = $3, status = 'completed', updated_at = now()
     WHERE id = $1 AND restaurant_id = $2 RETURNING *`,
    [id, restaurantId, hours],
  ).then((r) => r.rows[0]);

const deleteShift = (id, restaurantId) =>
  db.query(
    `DELETE FROM staff_shifts WHERE id = $1 AND restaurant_id = $2 RETURNING id`,
    [id, restaurantId],
  ).then((r) => r.rows[0]);

/** Shifts whose clock stamps look wrong and need a manager's eyes. */
const getShiftsForReview = (restaurantId, days) =>
  db.query(`
    SELECT s.id, s.work_date, s.hours, s.clock_in_at, s.clock_out_at, s.status,
           u.name AS staff_name
    FROM staff_shifts s
    JOIN users u ON u.id = s.user_id
    WHERE s.restaurant_id = $1
      AND s.clock_in_at IS NOT NULL
      AND s.work_date >= (now() - make_interval(days => $2))::date
  `, [restaurantId, days]).then((r) => r.rows);

const getStaffRate = (userId, restaurantId) =>
  db.query(
    `SELECT hourly_rate, name FROM users WHERE id = $1 AND restaurant_id = $2`,
    [userId, restaurantId],
  ).then((r) => r.rows[0]);

const setStaffRate = (userId, restaurantId, rate) =>
  db.query(
    `UPDATE users SET hourly_rate = $3 WHERE id = $1 AND restaurant_id = $2
     RETURNING id, name, hourly_rate`,
    [userId, restaurantId, rate],
  ).then((r) => r.rows[0]);

const listStaffRates = (restaurantId) =>
  db.query(
    `SELECT id, name, email, role, hourly_rate FROM users
     WHERE restaurant_id = $1 AND is_active IS NOT false
     ORDER BY name NULLS LAST, email`,
    [restaurantId],
  ).then((r) => r.rows);

module.exports = {
  listShifts, getWorkedShifts, createShift, clockIn, getActiveShift, closeShift,
  deleteShift, getShiftsForReview, getStaffRate, setStaffRate, listStaffRates,
};
