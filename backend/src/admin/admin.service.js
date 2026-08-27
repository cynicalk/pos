const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const repo     = require('./admin.repository');
const emailSvc = require('../shared/email.service');
const { ValidationError, NotFoundError, UnauthorizedError } = require('../shared/errors');
const { RESTAURANT_ROLES } = require('../shared/roles');
const { assertStrongPassword } = require('../shared/password');
const settingsOptions = require('../../../shared/settings-options.json');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

const SALT_ROUNDS = 12;
const VALID_OPERATOR_ROLES = ['super_admin', 'product_manager'];
const VALID_TIMEZONES = new Set(settingsOptions.timezones.map((t) => t.iana));
const VALID_CURRENCIES = new Set(settingsOptions.currencies.map((c) => c.code));

// ── Auth ─────────────────────────────────────────────────────────────────────

async function login(email, password) {
  if (!email || !password)
    throw new ValidationError('Email and password are required');

  const admin = await repo.findSuperAdminByEmail(email);
  if (!admin) throw new UnauthorizedError('Invalid credentials');

  const valid = await bcrypt.compare(password, admin.password);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const token = jwt.sign(
    { superAdminId: admin.id, role: admin.role, emailVerified: admin.email_verified, forcePasswordChange: !!admin.force_password_change },
    process.env.JWT_SECRET,
    { expiresIn: '8h' },
  );

  return { token, admin: { id: admin.id, email: admin.email, role: admin.role, emailVerified: admin.email_verified, forcePasswordChange: admin.force_password_change } };
}

// Only works when no super admin exists yet — first-run setup.
// Uses a conditional INSERT to avoid the TOCTOU race between count and insert.
async function setup(email, password) {
  if (!email || !password)
    throw new ValidationError('Email and password are required');
  assertStrongPassword(password);

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  const admin = await repo.createFirstSuperAdmin(email, hashed);
  if (!admin)
    throw new ValidationError('Setup already complete — use /admin/auth/login');

  const token = jwt.sign(
    { superAdminId: admin.id, role: 'super_admin', emailVerified: true },
    process.env.JWT_SECRET,
    { expiresIn: '8h' },
  );

  return { token, admin: { id: admin.id, email: admin.email, emailVerified: true } };
}

// ── Restaurants ───────────────────────────────────────────────────────────────

async function getAllRestaurants() {
  return repo.getAllRestaurants();
}

async function getRestaurant(id) {
  const [restaurant, users, settings, tableCount] = await Promise.all([
    repo.getRestaurantById(id),
    repo.getUsersByRestaurant(id),
    repo.getSettings(id),
    repo.countTablesByRestaurant(id),
  ]);
  if (!restaurant) throw new NotFoundError('Restaurant');
  return { ...restaurant, users, settings, table_count: tableCount };
}

async function regenerateRestaurantQr(id) {
  const restaurant = await repo.getRestaurantById(id);
  if (!restaurant) throw new NotFoundError('Restaurant');
  const count = await repo.regenerateTableTokens(id);
  return { count, name: restaurant.name };
}

async function createRestaurant(name) {
  if (!name || !name.trim()) throw new ValidationError('name is required');
  const restaurant = await repo.createRestaurant(name.trim());
  // Seed default settings for the new restaurant
  await Promise.all([
    repo.setSetting(restaurant.id, 'timezone', 'UTC'),
    repo.setSetting(restaurant.id, 'currency', 'USD'),
  ]);
  return restaurant;
}

async function updateRestaurant(id, name) {
  if (!name || !name.trim()) throw new ValidationError('name is required');
  const restaurant = await repo.updateRestaurant(id, name.trim());
  if (!restaurant) throw new NotFoundError('Restaurant');
  return restaurant;
}

async function deleteRestaurant(id) {
  const result = await repo.deleteRestaurant(id);
  if (!result) throw new NotFoundError('Restaurant');
  return result;
}

async function setRestaurantStatus(id, isActive) {
  const result = await repo.setRestaurantActive(id, isActive);
  if (!result) throw new NotFoundError('Restaurant');
  return result;
}

async function setRestaurantAiEnabled(id, enabled) {
  const result = await repo.setRestaurantAiEnabled(id, enabled);
  if (!result) throw new NotFoundError('Restaurant');
  return result;
}

// ── Users ─────────────────────────────────────────────────────────────────────

async function createUser({ email, password, role, restaurantId }) {
  if (!email || !password) throw new ValidationError('email and password are required');
  if (!RESTAURANT_ROLES.includes(role)) throw new ValidationError(`role must be one of: ${RESTAURANT_ROLES.join(', ')}`);
  assertStrongPassword(password);
  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  return repo.createUserForRestaurant({ email, password: hashed, role, restaurantId });
}

async function deleteUser(userId, restaurantId) {
  const user = await repo.deleteUser(userId, restaurantId);
  if (!user) throw new NotFoundError('User');
  return user;
}

async function getAllSuperAdmins() {
  return repo.getAllSuperAdmins();
}

async function createSuperAdmin(email, password, role = 'super_admin') {
  if (!email || !password) throw new ValidationError('email and password are required');
  if (!VALID_OPERATOR_ROLES.includes(role)) throw new ValidationError(`role must be one of: ${VALID_OPERATOR_ROLES.join(', ')}`);
  assertStrongPassword(password);
  const existing = await repo.findSuperAdminByEmail(email);
  if (existing) throw new ValidationError('An operator with this email already exists');
  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  const admin   = await repo.createSuperAdmin(email, hashed, role);

  const token     = generateToken();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 h
  await repo.setSuperAdminVerificationToken(admin.id, token, expiresAt);
  emailSvc.sendAdminVerificationEmail(email, token).catch((err) => {
    console.error(`[email] Failed to send admin verification to ${email}:`, err.message);
  });

  return admin;
}

async function deleteSuperAdminById(id, requesterId) {
  if (id === requesterId) throw new ValidationError('You cannot delete your own account');
  const admin = await repo.deleteSuperAdminById(id);
  if (!admin) throw new NotFoundError('Operator');
  return admin;
}

async function updateSuperAdminRole(id, role, requesterId) {
  // Block self-changes: a super admin demoting themselves would lose operator
  // management — and since only super admins reach this path, the guard also
  // guarantees at least one super admin always remains.
  if (id === requesterId) throw new ValidationError('You cannot change your own role');
  if (!VALID_OPERATOR_ROLES.includes(role))
    throw new ValidationError(`role must be one of: ${VALID_OPERATOR_ROLES.join(', ')}`);
  const admin = await repo.updateSuperAdminRole(id, role);
  if (!admin) throw new NotFoundError('Operator');
  return admin;
}

async function verifySuperAdminEmail(token) {
  if (!token) throw new ValidationError('Token is required');
  const admin = await repo.findSuperAdminByVerificationToken(token);
  if (!admin) throw new ValidationError('Invalid or already-used verification link');
  if (new Date(admin.verification_token_expires_at) < new Date())
    throw new ValidationError('Verification link has expired. Please request a new one.');
  if (admin.email_verified) return { ok: true };
  await repo.markSuperAdminEmailVerified(admin.id);
  return { ok: true };
}

async function resendSuperAdminVerification(email) {
  if (!email) throw new ValidationError('Email is required');
  const admin = await repo.findSuperAdminByEmail(email);
  if (!admin || admin.email_verified) return { ok: true };
  const token     = generateToken();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  await repo.setSuperAdminVerificationToken(admin.id, token, expiresAt);
  emailSvc.sendAdminVerificationEmail(email, token).catch((err) => {
    console.error(`[email] Failed to resend admin verification to ${email}:`, err.message);
  });
  return { ok: true };
}

async function resendSuperAdminVerificationById(id) {
  const admin = await repo.findSuperAdminById(id);
  if (!admin || admin.email_verified) return { ok: true };
  const token     = generateToken();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  await repo.setSuperAdminVerificationToken(admin.id, token, expiresAt);
  emailSvc.sendAdminVerificationEmail(admin.email, token).catch((err) => {
    console.error(`[email] Failed to resend admin verification to ${admin.email}:`, err.message);
  });
  return { ok: true };
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function getSettings(restaurantId) {
  return repo.getSettings(restaurantId);
}

async function updateSetting(restaurantId, key, value) {
  if (key === 'timezone' && !VALID_TIMEZONES.has(value))
    throw new ValidationError(`Invalid timezone: ${value}`);
  if (key === 'currency' && !VALID_CURRENCIES.has(value))
    throw new ValidationError(`Invalid currency: ${value}`);
  if (key === 'tax_rate' || key === 'service_charge') {
    const n = parseFloat(value);
    if (isNaN(n) || n < 0 || n > 100)
      throw new ValidationError(`${key} must be a number between 0 and 100`);
  }
  const VALID_KEYS = new Set([
    'timezone', 'currency', 'tax_rate', 'service_charge',
    // theme — brand
    'theme_primary', 'theme_accent_on',
    // theme — surfaces
    'theme_page_bg', 'theme_paper_2', 'theme_paper_3',
    // theme — sidebar
    'theme_sidebar_bg',
    // theme — text
    'theme_ink', 'theme_ink_2', 'theme_mute', 'theme_mute_2',
    // theme — borders
    'theme_line', 'theme_line_2',
    // theme — status
    'theme_ok', 'theme_warn', 'theme_bad', 'theme_info',
    // theme — logo
    'theme_logo_url', 'theme_logo_bg',
  ]);
  if (!VALID_KEYS.has(key)) throw new ValidationError(`Unknown setting: ${key}`);
  await repo.setSetting(restaurantId, key, value);
  return repo.getSettings(restaurantId);
}

async function getAuditLogs({ restaurantId, from, to, resourceType, limit }) {
  return repo.getAuditLogs({ restaurantId, from, to, resourceType, limit });
}

async function verifyPassword(superAdminId, password) {
  const admin = await repo.findSuperAdminById(superAdminId);
  if (!admin) throw new UnauthorizedError('Invalid credentials');
  const valid = await bcrypt.compare(password, admin.password);
  if (!valid) throw new UnauthorizedError('Invalid credentials');
  return { ok: true, email: admin.email };
}

async function me(superAdminId) {
  const admin = await repo.findSuperAdminById(superAdminId);
  if (!admin) throw new UnauthorizedError('Not found');
  return {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    emailVerified: admin.email_verified,
    forcePasswordChange: admin.force_password_change,
    createdAt: admin.created_at,
    defaults: admin.defaults || {},
  };
}

async function updateDefaults(superAdminId, defaults) {
  const admin = await repo.updateSuperAdminDefaults(superAdminId, defaults);
  if (!admin) throw new UnauthorizedError('Not found');
  return { defaults: admin.defaults || {} };
}

async function changePassword(superAdminId, currentPassword, newPassword) {
  if (!newPassword) throw new ValidationError('newPassword is required');
  assertStrongPassword(newPassword);

  const admin = await repo.findSuperAdminById(superAdminId);
  if (!admin) throw new UnauthorizedError('Not found');

  // Skip current-password check on forced first-time setup — identity already proven via JWT/Google
  if (!admin.force_password_change) {
    if (!currentPassword) throw new ValidationError('currentPassword is required');
    const valid = await bcrypt.compare(currentPassword, admin.password);
    if (!valid) throw new UnauthorizedError('Current password is incorrect');
  }

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await repo.updateSuperAdminPassword(superAdminId, hashed);
  await repo.clearSuperAdminForcePasswordChange(superAdminId);

  const token = jwt.sign(
    { superAdminId: admin.id, role: admin.role, emailVerified: admin.email_verified },
    process.env.JWT_SECRET,
    { expiresIn: '8h' },
  );
  return { token };
}

module.exports = {
  login,
  setup,
  getAllRestaurants,
  getRestaurant,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  setRestaurantStatus,
  setRestaurantAiEnabled,
  regenerateRestaurantQr,
  createUser,
  deleteUser,
  getAllSuperAdmins,
  createSuperAdmin,
  deleteSuperAdminById,
  updateSuperAdminRole,
  verifySuperAdminEmail,
  resendSuperAdminVerification,
  resendSuperAdminVerificationById,
  getSettings,
  updateSetting,
  getAuditLogs,
  verifyPassword,
  me,
  changePassword,
  updateDefaults,
};
