/*
 * eta.repository — read side for the live wait estimator.
 *
 * Reads the current floor state (occupied tables + their in-progress session,
 * free tables, upcoming reservations) so the service can turn it into estimates.
 * Pure math lives in eta.service; this file only fetches.
 */
const db = require('../shared/db');

// Occupied tables with their in-progress dining session summarised: when it
// started, whether the bill was requested, and the distinct non-cancelled
// categories ordered so far (the phase signal the weight model keys on).
const getOccupiedTablesWithSession = (restaurantId) =>
  db.query(
    `SELECT t.id AS table_id, t.number, t.seats,
            s.started_at, s.requested_bill_at,
            COALESCE(s.categories, '{}') AS categories
     FROM   tables t
     JOIN   LATERAL (
       SELECT MIN(o.created_at)        AS started_at,
              MIN(o.requested_bill_at) AS requested_bill_at,
              array_agg(DISTINCT mi.category)
                FILTER (WHERE mi.category IS NOT NULL AND oi.status <> 'cancelled') AS categories
       FROM   orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN menu_items  mi ON mi.id = oi.menu_item_id
       WHERE  o.table_id = t.id AND o.restaurant_id = $1
         AND  o.status NOT IN ('paid', 'cancelled')
     ) s ON TRUE
     WHERE  t.restaurant_id = $1 AND t.status = 'occupied'
     ORDER  BY t.number`,
    [restaurantId],
  ).then((r) => r.rows);

// Tables ready right now (a walk-in could be seated immediately).
const getAvailableTables = (restaurantId) =>
  db.query(
    `SELECT id AS table_id, number, seats
     FROM   tables
     WHERE  restaurant_id = $1 AND status = 'available'
     ORDER  BY number`,
    [restaurantId],
  ).then((r) => r.rows);

// Upcoming reservations that are bound to a specific table — used to hold that
// table for the reservation instead of handing it to a walk-in.
const getUpcomingReservations = (restaurantId) =>
  db.query(
    `SELECT table_id, reserved_at
     FROM   reservations
     WHERE  restaurant_id = $1 AND status = 'upcoming' AND table_id IS NOT NULL
       AND  reserved_at >= NOW()`,
    [restaurantId],
  ).then((r) => r.rows);

module.exports = {
  getOccupiedTablesWithSession,
  getAvailableTables,
  getUpcomingReservations,
};
