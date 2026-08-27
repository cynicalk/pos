const jwt = require('jsonwebtoken');
const db = require('../db');
const { UnauthorizedError, ForbiddenError } = require('../errors');

async function authenticate(req, res, next) {
  // HttpOnly cookie takes priority; fall back to Authorization header for
  // non-browser clients (CLI tools, tests, mobile apps).
  const cookieToken = req.cookies?.pos_token;
  const authHeader  = req.headers['authorization'];
  const token       = cookieToken || (authHeader && authHeader.split(' ')[1]);

  if (!token) return next(new UnauthorizedError('No token provided'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // For a normal staff token, validate the live user account in a single query:
    //   - the user must still exist (catches deleted accounts whose JWT is unexpired)
    //   - the user must be active (catches disabled accounts immediately)
    //   - the token must post-date the last password change (revocation)
    // The org a request acts within is resolved here, from the live row, rather
    // than carried as a JWT claim. Tokens last 8h, so a claim would go stale if
    // an outlet were ever moved between orgs — and this query already runs on
    // every authenticated request, so the join to restaurants costs one indexed
    // lookup and is always correct.
    let organizationId = null;

    if (decoded.userId) {
      const { rows } = await db.query(
        `SELECT u.is_active,
                EXTRACT(EPOCH FROM u.password_changed_at)::bigint AS pca,
                r.organization_id
           FROM users u
           LEFT JOIN restaurants r ON r.id = u.restaurant_id
          WHERE u.id = $1`,
        [decoded.userId],
      );
      const user = rows[0];
      if (!user) return next(new UnauthorizedError('Account no longer exists'));
      if (user.is_active === false) return next(new UnauthorizedError('Account is disabled'));
      if (decoded.iat && user.pca != null && Number(user.pca) > decoded.iat) {
        return next(new UnauthorizedError('Token revoked — please sign in again'));
      }
      organizationId = user.organization_id ?? null;
    } else if (decoded.restaurantId) {
      // Tokens without a userId (if any) still get the tenant-exists check.
      const { rows } = await db.query(
        'SELECT organization_id FROM restaurants WHERE id = $1',
        [decoded.restaurantId],
      );
      if (rows.length === 0) return next(new UnauthorizedError('Restaurant no longer exists'));
      organizationId = rows[0].organization_id ?? null;
    }

    req.user = { ...decoded, organizationId }; // { userId, role, restaurantId, organizationId }
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) return next(err);
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }
    next();
  };
}

module.exports = { authenticate, authorize };
