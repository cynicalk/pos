const router = require('express').Router();
const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');
const jwt    = require('jsonwebtoken');
const multer = require('multer');
const service = require('./admin.service');
const repo    = require('./admin.repository');
const settingsRepo = require('../settings/settings.repository');
const { authenticateSuperAdmin, requireEmailVerified, requirePasswordChanged, requireSuperAdmin } = require('./admin.middleware');
const { asyncHandler } = require('../shared/asyncHandler');

// Multer instance for restaurant logo uploads (images only, stored on disk)
const logoUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(__dirname, '../../uploads/logos');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      // req.params.id is interpolated into the on-disk filename. An encoded
      // slash or ".." in the route param could otherwise escape uploads/logos,
      // so only accept a plain UUID.
      const id = String(req.params.id || '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return cb(Object.assign(new Error('Invalid restaurant id'), { statusCode: 400 }), null);
      }
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `${id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    // SVG is intentionally excluded: it can carry embedded <script> and, served
    // same-origin from /uploads, would execute if opened directly — a stored XSS
    // vector. Only raster formats are accepted for logos.
    const ok = /\.(jpg|jpeg|png|webp|gif)$/i.test(file.originalname);
    if (!ok) { const e = new Error('Only image files are accepted (JPG, PNG, WebP, GIF)'); e.statusCode = 400; return cb(e, false); }
    cb(null, true);
  },
});

// Shorthand: auth only (read routes) vs auth + verified + password-changed (write routes).
// authSuper additionally restricts to full super admins (operator management).
const auth  = authenticateSuperAdmin;
const authV = [authenticateSuperAdmin, requireEmailVerified, requirePasswordChanged];
const authSuper = [authenticateSuperAdmin, requireEmailVerified, requirePasswordChanged, requireSuperAdmin];
const { rateLimit } = require('../shared/middleware/rateLimit');
const audit = require('../shared/audit');

const GOOGLE_CLIENT_ID          = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET      = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_ADMIN_CALLBACK_URL = process.env.GOOGLE_ADMIN_CALLBACK_URL || 'http://localhost:3000/admin/auth/google/callback';
const ADMIN_URL                 = process.env.ADMIN_URL || 'http://localhost:5174';

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict',
  secure:   process.env.NODE_ENV === 'production',
  maxAge:   8 * 60 * 60 * 1000,
  path:     '/',
};

const sa = (req) => ({ actorType: 'super_admin', actorId: req.superAdmin.superAdminId });

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts, please try again later',
});

const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many setup attempts',
});

const resendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many resend attempts, please try again later',
});

const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many verification attempts, please try again later',
});

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many password change attempts, please try again later',
});

const verifyPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many verification attempts, please try again later',
});

// ── Auth ─────────────────────────────────────────────────────────────────────

router.post('/auth/setup', setupLimiter, asyncHandler(async (req, res) => {
  const result = await service.setup(req.body.email, req.body.password);
  res.cookie('admin_token', result.token, COOKIE_OPTS);
  const { token: _t, ...safe } = result;
  res.status(201).json(safe);
}));

router.post('/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const result = await service.login(req.body.email, req.body.password);
    audit.log({ actorType: 'super_admin', actorId: result.admin.id, action: 'login', resourceType: 'super_admin', description: `Operator signed in (${result.admin.email})` });
    res.cookie('admin_token', result.token, COOKIE_OPTS);
    const { token: _t, ...safe } = result;
    res.json(safe);
  } catch (e) {
    audit.log({
      actorType: 'super_admin', actorId: null,
      action: 'login_failed', resourceType: 'super_admin',
      description: `Failed operator login for "${String(req.body?.email || '').slice(0, 200)}" from ${req.ip}`,
    });
    next(e);
  }
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie('admin_token', { ...COOKIE_OPTS, maxAge: 0 });
  res.status(204).send();
});

// ── Public verification endpoints ─────────────────────────────────────────────

router.get('/verify-email', verifyEmailLimiter, asyncHandler(async (req, res) => {
  res.json(await service.verifySuperAdminEmail(req.query.token));
}));

router.post('/resend-verification', resendLimiter, asyncHandler(async (req, res) => {
  res.json(await service.resendSuperAdminVerification(req.body.email));
}));

// ── Protected auth ────────────────────────────────────────────────────────────

router.get('/auth/me', auth, asyncHandler(async (req, res) => {
  res.json(await service.me(req.superAdmin.superAdminId));
}));

router.post('/auth/change-password', auth, changePasswordLimiter, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const result = await service.changePassword(req.superAdmin.superAdminId, currentPassword, newPassword);
  audit.log({
    ...sa(req),
    action: 'update', resourceType: 'super_admin', resourceId: req.superAdmin.superAdminId,
    description: 'Changed own password',
  });
  res.cookie('admin_token', result.token, COOKIE_OPTS);
  res.json({ ok: true });
}));

router.patch('/auth/me/defaults', authV, asyncHandler(async (req, res) => {
  const { timezone, currency, tax_rate, service_charge } = req.body;
  const result = await service.updateDefaults(req.superAdmin.superAdminId, { timezone, currency, tax_rate, service_charge });
  audit.log({ ...sa(req), action: 'update', resourceType: 'super_admin', resourceId: req.superAdmin.superAdminId, description: 'Updated new-restaurant defaults' });
  res.json(result);
}));

router.post('/auth/verify-password', authV, verifyPasswordLimiter, asyncHandler(async (req, res) => {
  const result = await service.verifyPassword(req.superAdmin.superAdminId, req.body.password);
  // Log the export action here so it's tied to a verified identity
  audit.log({
    ...sa(req),
    action: 'export',
    resourceType: 'audit_log',
    description: `Exported audit logs${req.body.context ? ` (${req.body.context})` : ''}`,
  });
  res.json(result);
}));

// ── Google OAuth ─────────────────────────────────────────────────────────────

router.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google sign-in is not configured' });

  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   5 * 60 * 1000,
    path:     '/',
  });

  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_ADMIN_CALLBACK_URL,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
    state,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code) {
    return res.redirect(`${ADMIN_URL}/login?error=oauth_cancelled`);
  }

  if (!state || state !== req.cookies.oauth_state) {
    return res.redirect(`${ADMIN_URL}/login?error=oauth_failed`);
  }
  res.clearCookie('oauth_state', { path: '/' });

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  GOOGLE_ADMIN_CALLBACK_URL,
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token returned');

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const { email } = await userInfoRes.json();
    if (!email) throw new Error('No email returned from Google');

    const admin = await repo.findSuperAdminByEmail(email);
    if (!admin) return res.redirect(`${ADMIN_URL}/login?error=no_account`);

    // Auto-verify email since Google confirmed it — but preserve force_password_change
    if (!admin.email_verified) {
      await repo.markSuperAdminEmailVerified(admin.id);
      admin.email_verified = true;
    }

    const token = jwt.sign(
      { superAdminId: admin.id, role: admin.role, emailVerified: true, forcePasswordChange: admin.force_password_change },
      process.env.JWT_SECRET,
      { expiresIn: '8h' },
    );

    audit.log({
      actorType: 'super_admin', actorId: admin.id,
      action: 'login', resourceType: 'super_admin',
      description: `Operator signed in via Google (${email})`,
    });

    res.cookie('admin_token', token, COOKIE_OPTS);
    res.redirect(`${ADMIN_URL}/oauth/callback`);
  } catch (e) {
    console.error('[admin google oauth]', e.message);
    res.redirect(`${ADMIN_URL}/login?error=oauth_failed`);
  }
});

// ── Restaurants ───────────────────────────────────────────────────────────────

router.get('/restaurants', auth, asyncHandler(async (req, res) => {
  res.json(await service.getAllRestaurants());
}));

router.post('/restaurants', authV, asyncHandler(async (req, res) => {
  const restaurant = await service.createRestaurant(req.body.name);
  audit.log({ ...sa(req), action: 'create', resourceType: 'restaurant', resourceId: restaurant.id, description: `Created restaurant "${restaurant.name}"` });
  res.status(201).json(restaurant);
}));

router.get('/restaurants/:id', auth, asyncHandler(async (req, res) => {
  res.json(await service.getRestaurant(req.params.id));
}));

router.patch('/restaurants/:id', authV, asyncHandler(async (req, res) => {
  const restaurant = await service.updateRestaurant(req.params.id, req.body.name);
  audit.log({ ...sa(req), restaurantId: req.params.id, action: 'update', resourceType: 'restaurant', resourceId: req.params.id, description: `Renamed restaurant to "${restaurant.name}"` });
  res.json(restaurant);
}));

router.patch('/restaurants/:id/status', authV, asyncHandler(async (req, res) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'is_active must be a boolean' });
  const restaurant = await service.setRestaurantStatus(req.params.id, is_active);
  audit.log({
    ...sa(req),
    restaurantId: req.params.id,
    action: 'update',
    resourceType: 'restaurant',
    resourceId: req.params.id,
    description: `${is_active ? 'Activated' : 'Suspended'} restaurant "${restaurant.name}"`,
  });
  res.json(restaurant);
}));

router.patch('/restaurants/:id/ai', authV, asyncHandler(async (req, res) => {
  const { ai_enabled } = req.body;
  if (typeof ai_enabled !== 'boolean') return res.status(400).json({ error: 'ai_enabled must be a boolean' });
  const restaurant = await service.setRestaurantAiEnabled(req.params.id, ai_enabled);
  audit.log({
    ...sa(req),
    restaurantId: req.params.id,
    action: 'update',
    resourceType: 'restaurant',
    resourceId: req.params.id,
    description: `${ai_enabled ? 'Enabled' : 'Disabled'} AI assistant for "${restaurant.name}"`,
  });
  res.json(restaurant);
}));

router.delete('/restaurants/:id', authV, asyncHandler(async (req, res) => {
  const deleted = await service.deleteRestaurant(req.params.id);
  audit.log({ ...sa(req), restaurantName: deleted.name, action: 'delete', resourceType: 'restaurant', resourceId: req.params.id, description: `Deleted restaurant "${deleted.name}"` });
  res.status(204).send();
}));

// Rotate every table's public QR token for a restaurant (revokes existing QRs)
router.post('/restaurants/:id/regenerate-qr', authV, asyncHandler(async (req, res) => {
  const result = await service.regenerateRestaurantQr(req.params.id);
  audit.log({
    ...sa(req),
    restaurantId: req.params.id,
    action: 'update',
    resourceType: 'restaurant',
    resourceId: req.params.id,
    description: `Regenerated QR codes for ${result.count} table(s) at "${result.name}"`,
  });
  res.json(result);
}));

// ── Users ─────────────────────────────────────────────────────────────────────

router.post('/restaurants/:id/users', authV, asyncHandler(async (req, res) => {
  const { email, password, role } = req.body;
  const user = await service.createUser({ email, password, role, restaurantId: req.params.id });
  audit.log({ ...sa(req), restaurantId: req.params.id, action: 'create', resourceType: 'user', resourceId: user.id, description: `Created user "${email}" with role ${role}` });
  res.status(201).json(user);
}));

router.delete('/restaurants/:id/users/:userId', authV, asyncHandler(async (req, res) => {
  const user = await service.deleteUser(req.params.userId, req.params.id);
  audit.log({ ...sa(req), restaurantId: req.params.id, action: 'delete', resourceType: 'user', resourceId: req.params.userId, description: `Deleted user "${user?.email || req.params.userId}"` });
  res.status(204).send();
}));

// ── Settings ──────────────────────────────────────────────────────────────────

router.get('/restaurants/:id/settings', auth, asyncHandler(async (req, res) => {
  res.json(await service.getSettings(req.params.id));
}));

router.patch('/restaurants/:id/settings', authV, asyncHandler(async (req, res) => {
  const { key, value } = req.body;
  const settings = await service.updateSetting(req.params.id, key, value);
  audit.log({ ...sa(req), restaurantId: req.params.id, action: 'update', resourceType: 'setting', resourceId: key, description: `Set ${key} to "${value}"` });
  res.json(settings);
}));

// ── Logo upload ───────────────────────────────────────────────────────────────

router.post('/restaurants/:id/logo', authV, logoUpload.single('logo'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/logos/${req.file.filename}`;
  await settingsRepo.set(req.params.id, 'theme_logo_url', url);
  audit.log({ ...sa(req), restaurantId: req.params.id, action: 'update', resourceType: 'setting', resourceId: 'theme_logo_url', description: 'Updated restaurant logo' });
  res.json({ url });
}));

router.delete('/restaurants/:id/logo', authV, asyncHandler(async (req, res) => {
  await settingsRepo.set(req.params.id, 'theme_logo_url', '');
  audit.log({ ...sa(req), restaurantId: req.params.id, action: 'delete', resourceType: 'setting', resourceId: 'theme_logo_url', description: 'Removed restaurant logo' });
  res.json({ ok: true });
}));

// ── Super admins ──────────────────────────────────────────────────────────────

router.get('/super-admins', authSuper, asyncHandler(async (req, res) => {
  res.json(await service.getAllSuperAdmins());
}));

router.post('/super-admins', authSuper, asyncHandler(async (req, res) => {
  const admin = await service.createSuperAdmin(req.body.email, req.body.password, req.body.role);
  audit.log({ ...sa(req), action: 'create', resourceType: 'super_admin', resourceId: admin.id, description: `Created operator "${admin.email}" (${admin.role})` });
  res.status(201).json(admin);
}));

router.delete('/super-admins/:id', authSuper, asyncHandler(async (req, res) => {
  const admin = await service.deleteSuperAdminById(req.params.id, req.superAdmin.superAdminId);
  audit.log({ ...sa(req), action: 'delete', resourceType: 'super_admin', resourceId: req.params.id, description: `Deleted operator "${admin.email}"` });
  res.status(204).send();
}));

router.patch('/super-admins/:id/role', authSuper, asyncHandler(async (req, res) => {
  const admin = await service.updateSuperAdminRole(req.params.id, req.body.role, req.superAdmin.superAdminId);
  audit.log({ ...sa(req), action: 'update', resourceType: 'super_admin', resourceId: admin.id, description: `Changed operator "${admin.email}" role to ${admin.role}` });
  res.json(admin);
}));

router.post('/super-admins/:id/resend-verification', authSuper, asyncHandler(async (req, res) => {
  res.json(await service.resendSuperAdminVerificationById(req.params.id));
}));

// ── Audit logs ────────────────────────────────────────────────────────────────

router.get('/audit-logs', auth, asyncHandler(async (req, res) => {
  const { restaurantId, from, to, resourceType, limit } = req.query;
  res.json(await service.getAuditLogs({ restaurantId, from, to, resourceType, limit: limit ? Math.min(parseInt(limit, 10), 2000) : 500 }));
}));

module.exports = router;
