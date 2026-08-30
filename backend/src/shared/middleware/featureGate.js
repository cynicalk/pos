const jwt = require('jsonwebtoken');
const settingsRepo = require('../../settings/settings.repository');
const { featureForApiPath } = require('../feature-routes');

/**
 * Server-side enforcement of the admin feature toggles.
 *
 * Runs once, before the API routers. If the request targets a gated feature's
 * route (see feature-routes.js) and that feature is switched off for the caller's
 * restaurant, it answers 403 `feature_disabled` — closing the gap where the app
 * hides a feature but its API still replies to a direct call.
 *
 * It reads the restaurant from the request's own token claim (the same cookie the
 * routers authenticate) rather than from the DB: identity here only needs the
 * tenant id, and the downstream `authenticate` still does the full live-account
 * check. When there is no valid token, or the path isn't a gated feature, it
 * steps aside and lets the normal auth / routing run — it never turns a missing
 * token into anything other than the 401 the router would already return.
 *
 * The flag lookup is cached briefly per restaurant so this costs nothing on the
 * hot path; a toggle write busts the cache immediately (see settings.service).
 */

const CACHE_TTL_MS = 15_000;
const cache = new Map(); // restaurantId -> { flags, at }

function parseFlags(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function flagsFor(restaurantId) {
  const hit = cache.get(restaurantId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.flags;
  const flags = parseFlags(await settingsRepo.getValue(restaurantId, 'feature_flags'));
  cache.set(restaurantId, { flags, at: Date.now() });
  return flags;
}

/** Drop a restaurant's cached flags so the next request re-reads them at once. */
function bustFeatureFlags(restaurantId) {
  cache.delete(restaurantId);
}

async function featureGate(req, res, next) {
  try {
    const feature = featureForApiPath(req.path);
    if (!feature) return next(); // not a gated feature — nothing to do

    const token = req.cookies?.pos_token
      || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    if (!token) return next(); // let authenticate return its 401

    let claims;
    try { claims = jwt.verify(token, process.env.JWT_SECRET); } catch { return next(); }
    const restaurantId = claims?.restaurantId;
    if (!restaurantId) return next();

    const flags = await flagsFor(restaurantId);
    if (flags[feature] === false) {
      return res.status(403).json({ error: 'feature_disabled', feature });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { featureGate, bustFeatureFlags };
