const router  = require('express').Router();
const crypto  = require('crypto');
const service = require('./auth.service');
const repo    = require('./auth.repository');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { rateLimit } = require('../shared/middleware/rateLimit');
const { asyncHandler } = require('../shared/asyncHandler');
const audit = require('../shared/audit');
const ws = require('../shared/websocket');

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL  = process.env.GOOGLE_CALLBACK_URL;
const APP_URL              = process.env.APP_URL || 'http://localhost:5173';

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict',
  secure:   process.env.NODE_ENV === 'production',
  maxAge:   8 * 60 * 60 * 1000, // 8 h — matches JWT expiry
  path:     '/',
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts, please try again later',
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many requests',
});

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many email requests, please try again later',
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const result = await service.login(req.body.email, req.body.password);
    audit.log({
      actorType: 'user', actorId: result.user.id, restaurantId: result.user.restaurantId,
      action: 'login', resourceType: 'user', resourceId: result.user.id,
      description: `User signed in (${result.user.email})`,
    });
    res.cookie('pos_token', result.token, COOKIE_OPTS);
    const { token: _t, ...safe } = result; // strip token from response body
    res.json(safe);
  } catch (e) {
    audit.log({
      actorType: 'user', actorId: null, restaurantId: null,
      action: 'login_failed', resourceType: 'user',
      description: `Failed login for "${String(req.body?.email || '').slice(0, 200)}" from ${req.ip}`,
    });
    next(e);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('pos_token', { ...COOKIE_OPTS, maxAge: 0 });
  res.status(204).send();
});

// Admin-only: register new staff/admin accounts within the same restaurant
router.post('/register', authenticate, authorize('admin'), writeLimiter, asyncHandler(async (req, res) => {
  const { email, password, role, name } = req.body;
  const user = await service.register(email, password, role, req.user.restaurantId, name);
  audit.log({
    actorType: 'user', actorId: req.user.userId, restaurantId: req.user.restaurantId,
    action: 'create', resourceType: 'user', resourceId: user.id,
    description: `Registered user "${email}" with role ${role}`,
  });
  res.status(201).json(user);
}));

// Get current user profile
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = await service.me(req.user.userId);
  res.json(user);
}));

// Admin-only: list all users in this restaurant
router.get('/users', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const users = await service.getAllUsers(req.user.restaurantId);
  res.json(users);
}));

// Admin-only: delete a user (must belong to same restaurant)
router.delete('/users/:id', authenticate, authorize('admin'), writeLimiter, asyncHandler(async (req, res) => {
  const deleted = await service.deleteUser(req.params.id, req.user.userId, req.user.restaurantId);
  audit.log({
    actorType: 'user', actorId: req.user.userId, restaurantId: req.user.restaurantId,
    action: 'delete', resourceType: 'user', resourceId: req.params.id,
    description: `Deleted user "${deleted?.email || req.params.id}"`,
  });
  res.status(204).send();
}));

// Change own password (any authenticated user)
router.post('/change-password', authenticate, writeLimiter, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const result = await service.changePassword(req.user.userId, currentPassword, newPassword);
  audit.log({
    actorType: 'user', actorId: req.user.userId, restaurantId: req.user.restaurantId,
    action: 'update', resourceType: 'user', resourceId: req.user.userId,
    description: 'Changed own password',
  });
  res.cookie('pos_token', result.token, COOKIE_OPTS);
  res.json({ ok: true });
}));

// Admin or self: update a user's display name
router.patch('/users/:id/name', authenticate, writeLimiter, asyncHandler(async (req, res) => {
  const isSelf  = req.params.id === req.user.userId;
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
  const user = await service.updateUserName(req.params.id, req.body.name ?? null, req.user.restaurantId);
  res.json(user);
}));

// Admin-only: set or clear a user's 4-digit staff PIN
router.patch('/users/:id/pin', authenticate, authorize('admin'), writeLimiter, asyncHandler(async (req, res) => {
  const pin = req.body.pin === '' ? null : req.body.pin;
  const user = await service.setStaffPin(req.params.id, pin, req.user.restaurantId);
  audit.log({
    actorType: 'user', actorId: req.user.userId, restaurantId: req.user.restaurantId,
    action: 'update', resourceType: 'user', resourceId: req.params.id,
    description: pin ? `Set staff PIN for "${user.email}"` : `Cleared staff PIN for "${user.email}"`,
  });
  res.json(user);
}));

// Admin-only: change a user's role (must belong to same restaurant)
router.patch('/users/:id/role', authenticate, authorize('admin'), writeLimiter, asyncHandler(async (req, res) => {
  const user = await service.updateUserRole(
    req.params.id,
    req.body.role,
    req.user.userId,
    req.user.restaurantId,
  );
  audit.log({
    actorType: 'user', actorId: req.user.userId, restaurantId: req.user.restaurantId,
    action: 'update', resourceType: 'user', resourceId: req.params.id,
    description: `Changed role of "${user.email}" to ${req.body.role}`,
  });
  res.json(user);
}));

// Admin-only: enable or disable a user account
router.patch('/users/:id/active', authenticate, authorize('admin'), writeLimiter, asyncHandler(async (req, res) => {
  const user = await service.setUserActive(req.params.id, !!req.body.is_active, req.user.userId, req.user.restaurantId);
  res.json(user);
}));

// Self or admin: mark presence (in restaurant / away)
router.patch('/users/:id/present', authenticate, writeLimiter, asyncHandler(async (req, res) => {
  const isSelf  = req.params.id === req.user.userId;
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
  const user = await service.setUserPresent(req.params.id, !!req.body.is_present, req.user.restaurantId);
  ws.broadcast('USER_PRESENCE', { userId: user.id, isPresent: user.is_present }, req.user.restaurantId);
  res.json(user);
}));

// --- account activation (new staff: set password + verify email) ---

router.post('/activate', writeLimiter, asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const result = await service.activate(token, password);
  res.json(result);
}));

// --- email verification ---

router.get('/verify-email', emailLimiter, asyncHandler(async (req, res) => {
  const result = await service.verifyEmail(req.query.token);
  res.json(result);
}));

router.post('/resend-verification', emailLimiter, asyncHandler(async (req, res) => {
  const result = await service.resendVerification(req.body.email);
  res.json(result);
}));

// Admin-only: resend verification for a specific user by id
router.post('/users/:id/resend-verification', authenticate, authorize('admin'), writeLimiter, asyncHandler(async (req, res) => {
  const target = await service.me(req.params.id);
  if (!target || target.restaurant_id !== req.user.restaurantId) {
    return res.status(404).json({ error: 'User not found' });
  }
  const result = await service.resendVerification(target.email);
  res.json(result);
}));

// --- password reset ---

router.post('/forgot-password', emailLimiter, asyncHandler(async (req, res) => {
  const result = await service.forgotPassword(req.body.email);
  res.json(result);
}));

router.post('/reset-password', writeLimiter, asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const result = await service.resetPassword(token, password);
  res.json(result);
}));

// --- Google OAuth ---

router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google sign-in is not configured' });

  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',   // must be lax — strict blocks Google's cross-origin redirect
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   5 * 60 * 1000, // 5 min — only needed for the OAuth round-trip
    path:     '/',
  });

  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
    state,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code) {
    return res.redirect(`${APP_URL}/login?error=oauth_cancelled`);
  }

  // CSRF check — state must match what we stored before the redirect
  if (!state || state !== req.cookies.oauth_state) {
    return res.redirect(`${APP_URL}/login?error=oauth_failed`);
  }
  res.clearCookie('oauth_state', { path: '/' });

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  GOOGLE_CALLBACK_URL,
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token returned');

    // Get user info from Google
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const { email, name } = await userInfoRes.json();
    if (!email) throw new Error('No email returned from Google');

    // Look up the user — only pre-registered accounts can sign in
    const user = await repo.findUserByEmail(email);
    if (!user)             return res.redirect(`${APP_URL}/login?error=no_account`);
    if (!user.is_active)   return res.redirect(`${APP_URL}/login?error=disabled`);

    // Google has verified this email — mark account active and clear any setup flags
    if (!user.email_verified || user.force_password_change) {
      await repo.markEmailVerified(user.id);
      await repo.clearForcePasswordChange(user.id);
    }

    const jwt = service.createTokenPublic(user.id, user.role, user.restaurant_id);

    audit.log({
      actorType: 'user', actorId: user.id, restaurantId: user.restaurant_id,
      action: 'login', resourceType: 'user', resourceId: user.id,
      description: `User signed in via Google (${email})`,
    });

    res.cookie('pos_token', jwt, COOKIE_OPTS);

    // Pass user+restaurant to the frontend via a short-lived URL param.
    // This is the same data stored in localStorage — not secret.
    const payload = Buffer.from(JSON.stringify({
      user: {
        id: user.id, email: user.email, name: user.name || null,
        role: user.role, restaurantId: user.restaurant_id,
        forcePasswordChange: false, emailVerified: true,
      },
      restaurant: { id: user.restaurant_id, name: user.restaurant_name },
    })).toString('base64url');

    res.redirect(`${APP_URL}/oauth/callback?d=${payload}`);
  } catch (e) {
    console.error('[google oauth]', e.message);
    res.redirect(`${APP_URL}/login?error=oauth_failed`);
  }
});

module.exports = router;
