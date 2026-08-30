/**
 * Feature toggles — the server-side half.
 *
 * The admin toggles at /feature-toggles hide features in the operator app and
 * gate their client routes. This map lets the API refuse a switched-off feature
 * too, so a direct call (curl, a stale tab, a scripted client) doesn't sail past
 * a toggle the operator set.
 *
 * It maps a toggle key — the same nav key the dashboard stores in `feature_flags`
 * (a path like `/reviews`, or `group:<key>` for a whole section) — to the backend
 * route prefix(es) that serve it. Only features whose prefix is *dedicated to that
 * one feature* are listed: gating a router shared by another (still-enabled)
 * feature would switch off more than the operator asked for. The rest stay
 * UI-level for now — documented in ROADMAP, not silently half-enforced here.
 *
 * Forecasting is gated at the section level: `/api/forecast` and `/api/prep`
 * serve only the Forecasting nav group, so the group switch governs them both.
 * Its per-page child switches (Demand, Prep Sheet, Waste…) hit overlapping
 * sub-paths and stay client-side.
 */

const FEATURE_API_ROUTES = {
  'group:forecasting': ['/api/forecast', '/api/prep'],
  '/procurement':      ['/api/procurement'],
  '/ingredients':      ['/api/ingredients'],
  '/recipes':          ['/api/recipes'],
  '/combos':           ['/api/combos'],
  '/inventory':        ['/api/inventory'],
  '/stocktake':        ['/api/stocktake'],
  '/coupons':          ['/api/coupons'],
  '/reviews':          ['/api/reviews'],
  '/rankings':         ['/api/reputation'],
  '/payouts':          ['/api/payouts'],
  '/accounting':       ['/api/accounting'],
  '/compliance':       ['/api/compliance'],
  '/outbox':           ['/api/messaging'],
};

// Flattened to { prefix, feature }, longest prefix first so the most specific
// mount wins if two ever nest.
const PREFIX_INDEX = Object.entries(FEATURE_API_ROUTES)
  .flatMap(([feature, prefixes]) => prefixes.map((prefix) => ({ prefix, feature })))
  .sort((a, b) => b.prefix.length - a.prefix.length);

/**
 * The toggle key that owns an incoming API path, or null when none does (the
 * path isn't a gated feature, so the request passes through untouched).
 */
function featureForApiPath(pathname) {
  if (!pathname) return null;
  for (const { prefix, feature } of PREFIX_INDEX) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return feature;
  }
  return null;
}

module.exports = { FEATURE_API_ROUTES, featureForApiPath };
