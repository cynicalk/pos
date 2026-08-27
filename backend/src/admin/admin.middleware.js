const jwt  = require('jsonwebtoken');
const repo = require('./admin.repository');
const { UnauthorizedError, ForbiddenError } = require('../shared/errors');

// Roles that may sign in to the operator (admin) portal at all.
const OPERATOR_ROLES = ['super_admin', 'product_manager'];

async function authenticateSuperAdmin(req, res, next) {
  const cookieToken = req.cookies?.admin_token;
  const authHeader  = req.headers['authorization'];
  const token       = cookieToken || (authHeader && authHeader.split(' ')[1]);

  if (!token) return next(new UnauthorizedError('No token provided'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!OPERATOR_ROLES.includes(decoded.role)) {
      return next(new ForbiddenError('Operator access required'));
    }

    // Verify the account still exists — catches deleted admins whose JWT is still valid
    const admin = await repo.findSuperAdminById(decoded.superAdminId);
    if (!admin) return next(new UnauthorizedError('Account not found'));

    req.superAdmin = decoded;
    req.superAdminRow = admin;
    next();
  } catch (e) {
    next(e instanceof UnauthorizedError || e instanceof ForbiddenError
      ? e
      : new UnauthorizedError('Invalid or expired token'));
  }
}

function requireEmailVerified(req, res, next) {
  if (!req.superAdmin?.emailVerified) {
    return next(new ForbiddenError('Please verify your email address to perform this action'));
  }
  next();
}

function requirePasswordChanged(req, res, next) {
  if (req.superAdminRow?.force_password_change) {
    return next(new ForbiddenError('Please change your password before performing this action'));
  }
  next();
}

// Operator-management actions (managing other operators) are reserved for full
// super admins; product managers have every other capability but not this one.
function requireSuperAdmin(req, res, next) {
  if (req.superAdmin?.role !== 'super_admin') {
    return next(new ForbiddenError('Only super admins can manage operators'));
  }
  next();
}

module.exports = { authenticateSuperAdmin, requireEmailVerified, requirePasswordChanged, requireSuperAdmin };
