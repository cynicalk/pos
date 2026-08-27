const db = require('../shared/db');

// ── Super admin auth ────────────────────────────────────────────────────────

const findSuperAdminByEmail = (email) =>
  db.query('SELECT * FROM super_admins WHERE email = $1', [email])
    .then((r) => r.rows[0]);

const findSuperAdminById = (id) =>
  db.query('SELECT * FROM super_admins WHERE id = $1', [id])
    .then((r) => r.rows[0]);

const getAllSuperAdmins = () =>
  db.query(
    'SELECT id, email, role, email_verified, created_at FROM super_admins ORDER BY created_at ASC',
  ).then((r) => r.rows);

const createSuperAdmin = (email, hashedPassword, role = 'super_admin') =>
  db.query(
    `INSERT INTO super_admins (email, password, role, email_verified, force_password_change)
     VALUES ($1, $2, $3, FALSE, TRUE) RETURNING id, email, role, email_verified, force_password_change, created_at`,
    [email, hashedPassword, role],
  ).then((r) => r.rows[0]);

const deleteSuperAdminById = (id) =>
  db.query(
    'DELETE FROM super_admins WHERE id = $1 RETURNING id, email',
    [id],
  ).then((r) => r.rows[0]);

const findSuperAdminByVerificationToken = (token) =>
  db.query('SELECT * FROM super_admins WHERE verification_token = $1', [token])
    .then((r) => r.rows[0]);

const markSuperAdminEmailVerified = (id) =>
  db.query(
    `UPDATE super_admins
     SET email_verified = TRUE, verification_token = NULL, verification_token_expires_at = NULL
     WHERE id = $1`,
    [id],
  );

const clearSuperAdminForcePasswordChange = (id) =>
  db.query(
    'UPDATE super_admins SET force_password_change = FALSE WHERE id = $1',
    [id],
  );

const setSuperAdminVerificationToken = (id, token, expiresAt) =>
  db.query(
    `UPDATE super_admins
     SET verification_token = $1, verification_token_expires_at = $2
     WHERE id = $3`,
    [token, expiresAt, id],
  );

const updateSuperAdminDefaults = (id, defaults) =>
  db.query(
    'UPDATE super_admins SET defaults = $1 WHERE id = $2 RETURNING id, email, created_at, defaults',
    [JSON.stringify(defaults), id],
  ).then((r) => r.rows[0]);

const countSuperAdmins = () =>
  db.query('SELECT COUNT(*) FROM super_admins')
    .then((r) => parseInt(r.rows[0].count, 10));

// Atomic first-admin creation: only inserts if no super_admin exists. Eliminates
// the TOCTOU window between countSuperAdmins() and the insert.
const createFirstSuperAdmin = (email, password) =>
  db.query(
    `INSERT INTO super_admins (email, password, email_verified)
     SELECT $1, $2, TRUE
     WHERE NOT EXISTS (SELECT 1 FROM super_admins)
     RETURNING id, email, email_verified, created_at`,
    [email, password],
  ).then((r) => r.rows[0] || null);

// ── Restaurants (cross-tenant) ───────────────────────────────────────────────

const getAllRestaurants = () =>
  db.query(
    // Scalar subqueries (not JOINs) so the two counts don't multiply each other.
    `SELECT r.id, r.name, r.is_active, r.ai_enabled, r.created_at,
            (SELECT COUNT(*) FROM users  u WHERE u.restaurant_id = r.id)::int AS user_count,
            (SELECT COUNT(*) FROM tables t WHERE t.restaurant_id = r.id)::int AS table_count
     FROM restaurants r
     ORDER BY r.created_at DESC`,
  ).then((r) => r.rows);

const setRestaurantActive = (id, isActive) =>
  db.query(
    'UPDATE restaurants SET is_active = $1 WHERE id = $2 RETURNING id, name, is_active',
    [isActive, id],
  ).then((r) => r.rows[0]);

const setRestaurantAiEnabled = (id, enabled) =>
  db.query(
    'UPDATE restaurants SET ai_enabled = $1 WHERE id = $2 RETURNING id, name, ai_enabled',
    [enabled, id],
  ).then((r) => r.rows[0]);

const getRestaurantById = (id) =>
  db.query('SELECT * FROM restaurants WHERE id = $1', [id])
    .then((r) => r.rows[0]);

const countTablesByRestaurant = (id) =>
  db.query('SELECT COUNT(*)::int AS count FROM tables WHERE restaurant_id = $1', [id])
    .then((r) => r.rows[0].count);

// Issue a fresh random public_token to every table in a restaurant — invalidates
// all existing QR codes for that tenant. Returns the number of tables rotated.
const regenerateTableTokens = (restaurantId) =>
  db.query(
    'UPDATE tables SET public_token = gen_random_uuid() WHERE restaurant_id = $1',
    [restaurantId],
  ).then((r) => r.rowCount);

const createRestaurant = (name) =>
  db.query(
    'INSERT INTO restaurants (name) VALUES ($1) RETURNING *',
    [name],
  ).then((r) => r.rows[0]);

const updateRestaurant = (id, name) =>
  db.query(
    'UPDATE restaurants SET name = $1 WHERE id = $2 RETURNING *',
    [name, id],
  ).then((r) => r.rows[0]);

const deleteRestaurant = (id) =>
  db.query('DELETE FROM restaurants WHERE id = $1 RETURNING id, name', [id])
    .then((r) => r.rows[0]);

// ── Users (cross-tenant) ─────────────────────────────────────────────────────

const getAllUsers = () =>
  db.query(
    `SELECT u.id, u.email, u.name, u.role, u.is_active, u.email_verified,
            u.force_password_change, u.created_at, u.restaurant_id,
            r.name AS restaurant_name
     FROM users u
     JOIN restaurants r ON r.id = u.restaurant_id
     ORDER BY u.created_at DESC`,
  ).then((r) => r.rows);

const findUserById = (id) =>
  db.query('SELECT * FROM users WHERE id = $1', [id])
    .then((r) => r.rows[0]);

const deleteUserById = (id) =>
  db.query('DELETE FROM users WHERE id = $1 RETURNING id, email', [id])
    .then((r) => r.rows[0]);

const setUserActive = (id, isActive) =>
  db.query(
    'UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, is_active',
    [isActive, id],
  ).then((r) => r.rows[0]);

const setVerificationTokenForUser = (id, token, expiresAt) =>
  db.query(
    `UPDATE users SET verification_token = $1, verification_token_expires_at = $2
     WHERE id = $3`,
    [token, expiresAt, id],
  );

const getUsersByRestaurant = (restaurantId) =>
  db.query(
    `SELECT id, email, role, created_at FROM users
     WHERE restaurant_id = $1 ORDER BY created_at DESC`,
    [restaurantId],
  ).then((r) => r.rows);

const createUserForRestaurant = ({ email, password, role, restaurantId }) =>
  db.query(
    `INSERT INTO users (email, password, role, restaurant_id, force_password_change)
     VALUES ($1, $2, $3, $4, true) RETURNING id, email, role, created_at`,
    [email, password, role, restaurantId],
  ).then((r) => r.rows[0]);

const deleteUser = (userId, restaurantId) =>
  db.query(
    'DELETE FROM users WHERE id = $1 AND restaurant_id = $2 RETURNING id, email',
    [userId, restaurantId],
  ).then((r) => r.rows[0]);

// ── Settings (cross-tenant) ──────────────────────────────────────────────────

const getSettings = (restaurantId) =>
  db.query('SELECT key, value FROM settings WHERE restaurant_id = $1', [restaurantId])
    .then((r) => Object.fromEntries(r.rows.map((row) => [row.key, row.value])));

const setSetting = (restaurantId, key, value) =>
  db.query(
    `INSERT INTO settings (restaurant_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (restaurant_id, key) DO UPDATE SET value = $3`,
    [restaurantId, key, value],
  );

const getAuditLogs = ({ restaurantId, from, to, resourceType, limit }) =>
  db.query(
    `SELECT
       l.id, l.restaurant_id, l.actor_type, l.actor_id,
       l.action, l.resource_type, l.resource_id,
       l.description, l.meta, l.created_at,
       COALESCE(u.email, sa.email)        AS actor_email,
       COALESCE(l.restaurant_name, r.name) AS restaurant_name
     FROM audit_logs l
     LEFT JOIN users        u  ON u.id  = l.actor_id AND l.actor_type = 'user'
     LEFT JOIN super_admins sa ON sa.id = l.actor_id AND l.actor_type = 'super_admin'
     LEFT JOIN restaurants  r  ON r.id  = l.restaurant_id
     WHERE ($1::uuid IS NULL OR l.restaurant_id = $1)
       AND ($2::date IS NULL OR l.created_at::date >= $2::date)
       AND ($3::date IS NULL OR l.created_at::date <= $3::date)
       AND ($4::text IS NULL OR l.resource_type = $4)
     ORDER BY l.created_at DESC
     LIMIT $5`,
    [restaurantId || null, from || null, to || null, resourceType || null, limit || 500],
  ).then((r) => r.rows);

const updateSuperAdminPassword = (id, hashedPassword) =>
  db.query(
    'UPDATE super_admins SET password = $1 WHERE id = $2 RETURNING id, email',
    [hashedPassword, id],
  ).then((r) => r.rows[0]);

const updateSuperAdminRole = (id, role) =>
  db.query(
    'UPDATE super_admins SET role = $1 WHERE id = $2 RETURNING id, email, role',
    [role, id],
  ).then((r) => r.rows[0]);

module.exports = {
  findSuperAdminByEmail,
  findSuperAdminById,
  getAllSuperAdmins,
  createSuperAdmin,
  deleteSuperAdminById,
  findSuperAdminByVerificationToken,
  markSuperAdminEmailVerified,
  clearSuperAdminForcePasswordChange,
  setSuperAdminVerificationToken,
  countSuperAdmins,
  createFirstSuperAdmin,
  updateSuperAdminPassword,
  updateSuperAdminRole,
  updateSuperAdminDefaults,
  getAllRestaurants,
  getRestaurantById,
  countTablesByRestaurant,
  regenerateTableTokens,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  setRestaurantActive,
  setRestaurantAiEnabled,
  getAllUsers,
  findUserById,
  deleteUserById,
  setUserActive,
  setVerificationTokenForUser,
  getUsersByRestaurant,
  createUserForRestaurant,
  deleteUser,
  getSettings,
  setSetting,
  getAuditLogs,
};
