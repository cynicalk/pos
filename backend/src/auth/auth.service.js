const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const repo    = require('./auth.repository');
const emailSvc = require('../shared/email.service');
const { UnauthorizedError, ValidationError, NotFoundError, ForbiddenError } = require('../shared/errors');
const { RESTAURANT_ROLES } = require('../shared/roles');
const { assertStrongPassword } = require('../shared/password');

const SALT_ROUNDS = 12;

// Login compares against this throwaway hash when the email doesn't exist, so a
// failed login takes the same ~bcrypt time whether or not the account is real —
// otherwise the faster "no such user" path leaks which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('cooklyt-timing-guard-not-a-real-password', SALT_ROUNDS);

function createToken(userId, role, restaurantId, extra = {}) {
  return jwt.sign(
    { userId, role, restaurantId, ...extra },
    process.env.JWT_SECRET,
    { expiresIn: '8h' },
  );
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function login(email_, password) {
  if (!email_ || !password)
    throw new ValidationError('Email and password are required');

  const user = await repo.findUserByEmail(email_);
  if (!user) {
    // Run a comparison anyway so timing matches the real-account path.
    await bcrypt.compare(password, DUMMY_HASH);
    throw new UnauthorizedError('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new UnauthorizedError('Invalid credentials');
  if (user.is_active === false) throw new UnauthorizedError('Account is disabled');
  if (!user.email_verified) throw new ForbiddenError('EMAIL_NOT_VERIFIED');

  const token = createToken(user.id, user.role, user.restaurant_id, {
    forcePasswordChange: user.force_password_change,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name || null,
      role: user.role,
      restaurantId: user.restaurant_id,
      forcePasswordChange: user.force_password_change,
      emailVerified: true,
    },
    restaurant: { id: user.restaurant_id, name: user.restaurant_name },
  };
}

async function register(email_, password, role = 'staff', restaurantId, name) {
  if (!email_) throw new ValidationError('Email is required');
  if (!restaurantId) throw new ValidationError('restaurantId is required');

  const existing = await repo.findUserByEmail(email_);
  if (existing) throw new ValidationError('Email already in use');

  // Password is not set by the admin — user will choose their own via the setup link.
  // We store an unguessable placeholder so the account is unusable until activated.
  const placeholder = crypto.randomBytes(32).toString('hex');
  const hashed      = await bcrypt.hash(placeholder, SALT_ROUNDS);

  const token     = generateToken();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 h

  const user = await repo.createUser({
    email: email_, password: hashed, role, name, restaurantId,
    verificationToken: token, verificationTokenExpiresAt: expiresAt,
    forcePasswordChange: true,
  });

  emailSvc.sendAccountSetupEmail(email_, token).catch((err) => {
    console.error(`[email] Failed to send setup email to ${email_}:`, err.message);
  });

  return user;
}

async function me(userId) {
  const user = await repo.findUserById(userId);
  if (!user) throw new UnauthorizedError('User not found');
  return user;
}

async function getAllUsers(restaurantId) {
  return repo.findAllUsers(restaurantId);
}

async function deleteUser(targetId, requestingUserId, restaurantId) {
  if (targetId === requestingUserId)
    throw new ValidationError('You cannot delete your own account');
  const user = await repo.findUserById(targetId);
  if (!user || user.restaurant_id !== restaurantId) throw new NotFoundError('User');
  return repo.deleteUser(targetId, restaurantId);
}

async function updateUserRole(targetId, role, requestingUserId, restaurantId) {
  if (targetId === requestingUserId)
    throw new ValidationError('You cannot change your own role');
  if (!RESTAURANT_ROLES.includes(role))
    throw new ValidationError(`role must be one of: ${RESTAURANT_ROLES.join(', ')}`);
  const user = await repo.findUserById(targetId);
  if (!user || user.restaurant_id !== restaurantId) throw new NotFoundError('User');
  return repo.updateUserRole(targetId, role, restaurantId);
}

async function signup(restaurantName, email_, password) {
  if (!restaurantName || !email_ || !password)
    throw new ValidationError('restaurantName, email and password are required');
  assertStrongPassword(password);

  const existing = await repo.findUserByEmail(email_);
  if (existing) throw new ValidationError('Email already in use');

  const hashed    = await bcrypt.hash(password, SALT_ROUNDS);
  const token     = generateToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const { restaurant, user } = await repo.createRestaurantWithAdmin({
    restaurantName,
    email: email_,
    password: hashed,
    verificationToken: token,
    verificationTokenExpiresAt: expiresAt,
  });

  emailSvc.sendVerificationEmail(email_, token).catch((err) => {
    console.error(`[email] Failed to send verification to ${email_}:`, err.message);
  });

  // Don't issue a JWT yet — user must verify first
  return {
    user:       { id: user.id, email: user.email, role: user.role, restaurantId: restaurant.id },
    restaurant: { id: restaurant.id, name: restaurant.name },
  };
}

async function changePassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword)
    throw new ValidationError('currentPassword and newPassword are required');
  assertStrongPassword(newPassword);

  const user = await repo.findUserById(userId);
  if (!user) throw new UnauthorizedError('User not found');

  const { rows } = await require('../shared/db').query(
    'SELECT password FROM users WHERE id = $1', [userId],
  );
  const valid = await bcrypt.compare(currentPassword, rows[0].password);
  if (!valid) throw new UnauthorizedError('Current password is incorrect');

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await repo.updatePassword(userId, hashed);

  const newToken = createToken(user.id, user.role, user.restaurant_id, { forcePasswordChange: false });
  return { token: newToken };
}

async function updateUserName(targetId, name, restaurantId) {
  const user = await repo.findUserById(targetId);
  if (!user || user.restaurant_id !== restaurantId) throw new NotFoundError('User');
  return repo.updateUserName(targetId, name, restaurantId);
}

async function setStaffPin(targetId, pin, restaurantId) {
  const user = await repo.findUserById(targetId);
  if (!user || user.restaurant_id !== restaurantId) throw new NotFoundError('User');
  if (pin !== null && !/^\d{4}$/.test(pin)) throw new ValidationError('PIN must be exactly 4 digits');
  return repo.setStaffPin(targetId, pin, restaurantId);
}

async function setUserActive(targetId, isActive, actorId, restaurantId) {
  const user = await repo.findUserById(targetId);
  if (!user || user.restaurant_id !== restaurantId) throw new NotFoundError('User');
  if (targetId === actorId) throw new ValidationError('Cannot disable your own account');
  return repo.setUserActive(targetId, isActive, restaurantId);
}

async function setUserPresent(targetId, isPresent, restaurantId) {
  const user = await repo.findUserById(targetId);
  if (!user || user.restaurant_id !== restaurantId) throw new NotFoundError('User');
  return repo.setUserPresent(targetId, isPresent, restaurantId);
}

// --- account activation (new staff accounts set their own password here) ---

async function activate(token, newPassword) {
  if (!token || !newPassword) throw new ValidationError('Token and password are required');
  assertStrongPassword(newPassword);

  const user = await repo.findUserByVerificationToken(token);
  if (!user) throw new ValidationError('Invalid or expired setup link');
  if (new Date(user.verification_token_expires_at) < new Date())
    throw new ValidationError('Setup link has expired. Ask your admin to send a new invite.');

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await repo.updatePassword(user.id, hashed);
  await repo.markEmailVerified(user.id);

  return { ok: true };
}

// --- email verification ---

async function verifyEmail(token) {
  if (!token) throw new ValidationError('Verification token is required');

  const user = await repo.findUserByVerificationToken(token);
  if (!user) throw new ValidationError('Invalid or expired verification link');
  if (user.email_verified) return { ok: true };
  if (new Date(user.verification_token_expires_at) < new Date())
    throw new ValidationError('Verification link has expired. Please request a new one.');

  // Admin-created account — password not set yet. Tell frontend to redirect to set-password.
  if (user.force_password_change) {
    return { needsPasswordSetup: true };
  }

  await repo.markEmailVerified(user.id);
  return { ok: true };
}

async function resendVerification(email_) {
  if (!email_) throw new ValidationError('Email is required');

  const user = await repo.findUserByEmail(email_);
  if (!user || user.email_verified) return { ok: true };

  const isAdminCreated = user.force_password_change;
  const expiresAt = new Date(Date.now() + (isAdminCreated ? 72 : 24) * 60 * 60 * 1000);
  const token     = generateToken();
  await repo.setVerificationToken(user.id, token, expiresAt);

  if (isAdminCreated) {
    emailSvc.sendAccountSetupEmail(email_, token).catch((err) => {
      console.error(`[email] Failed to resend setup email to ${email_}:`, err.message);
    });
  } else {
    emailSvc.sendVerificationEmail(email_, token).catch((err) => {
      console.error(`[email] Failed to resend verification to ${email_}:`, err.message);
    });
  }

  return { ok: true };
}

// --- password reset ---

async function forgotPassword(email_) {
  if (!email_) throw new ValidationError('Email is required');

  const user = await repo.findUserByEmail(email_);
  // Silent success — don't leak whether the email exists
  if (!user || !user.email_verified) return { ok: true };

  const token     = generateToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await repo.setResetToken(user.id, token, expiresAt);

  emailSvc.sendPasswordResetEmail(email_, token).catch((err) => {
    console.error(`[email] Failed to send reset email to ${email_}:`, err.message);
  });

  return { ok: true };
}

async function resetPassword(token, newPassword) {
  if (!token || !newPassword) throw new ValidationError('Token and password are required');
  assertStrongPassword(newPassword);

  const user = await repo.findUserByResetToken(token);
  if (!user) throw new ValidationError('Invalid or expired reset link');
  if (new Date(user.reset_token_expires_at) < new Date())
    throw new ValidationError('Reset link has expired. Please request a new one.');

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await repo.updatePassword(user.id, hashed);
  await repo.clearResetToken(user.id);

  return { ok: true };
}

// Exposed for the Google OAuth router which needs to issue a JWT directly
const createTokenPublic = createToken;

module.exports = {
  login, register, me, getAllUsers, deleteUser, updateUserRole, updateUserName,
  changePassword, signup, setStaffPin, setUserActive, setUserPresent,
  activate, verifyEmail, resendVerification, forgotPassword, resetPassword,
  createTokenPublic,
};
