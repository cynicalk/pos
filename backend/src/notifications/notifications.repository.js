const db = require('../shared/db');

const listForUser = (userId, restaurantId) =>
  db.query(
    `SELECT id, event, data, read, created_at
     FROM staff_notifications
     WHERE user_id = $1 AND restaurant_id = $2
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId, restaurantId],
  ).then((r) => r.rows);

const markAllRead = (userId, restaurantId) =>
  db.query(
    'UPDATE staff_notifications SET read = true WHERE user_id = $1 AND restaurant_id = $2',
    [userId, restaurantId],
  );

const clearForUser = (userId, restaurantId) =>
  db.query(
    'DELETE FROM staff_notifications WHERE user_id = $1 AND restaurant_id = $2',
    [userId, restaurantId],
  );

module.exports = { listForUser, markAllRead, clearForUser };
