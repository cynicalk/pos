const db = require('../shared/db');

const findById = (id) =>
  db.query('SELECT id, name, public_token, created_at FROM restaurants WHERE id = $1', [id])
    .then((r) => r.rows[0]);

// Resolve the door-QR token to an ACTIVE restaurant (used by public waitlist
// endpoints — a deactivated restaurant must stop accepting walk-ins).
const findByPublicToken = (token) =>
  db.query(
    'SELECT id, name, public_token FROM restaurants WHERE public_token = $1 AND is_active = true',
    [token],
  ).then((r) => r.rows[0]);

const findAll = () =>
  db.query('SELECT id, name, created_at FROM restaurants ORDER BY created_at ASC')
    .then((r) => r.rows);

const create = (name) =>
  db.query(
    'INSERT INTO restaurants (name) VALUES ($1) RETURNING id, name, created_at',
    [name],
  ).then((r) => r.rows[0]);

module.exports = { findById, findByPublicToken, findAll, create };
