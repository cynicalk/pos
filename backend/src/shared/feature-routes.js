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
 * route prefix(es) that serve it. Where a router is shared between two features,
 * the split is by sub-path and the longer prefix wins (see the reverse index
 * below): `/api/reputation/guests` belongs to Guests while the rest of
 * `/api/reputation` belongs to Rankings; `/api/reports/food-cost-variance` is
 * Variance while the rest of `/api/reports` is Reports; and so on.
 *
 * Cross-feature reads are fine: a protected page (Overview) that reads a gated
 * feature's endpoint simply gets a 403 for that one call and renders the widget
 * empty — the client already tolerates it — so a disabled feature shows no data
 * anywhere, which is the intent.
 *
 * A few features are deliberately NOT enforced here and stay client-side only,
 * because they have no dedicated server route to gate:
 *   - Costing reads Inventory + Recipes; Order History reads Orders (core) — a
 *     server gate would have to switch off another feature's router.
 *   - The Market-Intel shells and the Tally integration have no live data route.
 * Their nav entries and pages are still hidden by the client toggle.
 */

const FEATURE_API_ROUTES = {
  // Forecasting is gated at the section level: /api/forecast and /api/prep serve
  // only the Forecasting nav group, so the group switch governs them both. Its
  // per-page child switches (Demand, Prep Sheet, Waste…) hit overlapping
  // sub-paths and stay client-side.
  'group:forecasting': ['/api/forecast', '/api/prep'],

  // Dedicated routers — one feature each.
  '/procurement': ['/api/procurement'],
  '/ingredients': ['/api/ingredients'],
  '/recipes':     ['/api/recipes'],
  '/combos':      ['/api/combos'],
  '/inventory':   ['/api/inventory'],
  '/stocktake':   ['/api/stocktake'],
  '/coupons':     ['/api/coupons'],
  '/loyalty':     ['/api/loyalty'],
  '/reviews':     ['/api/reviews'],
  '/payouts':     ['/api/payouts'],
  '/accounting':  ['/api/accounting'],
  '/actions':     ['/api/actions'],
  '/group':       ['/api/group'],
  '/waste-log':   ['/api/waste', '/api/wastage-reviews'],
  '/tables/waitlist': ['/api/waitlist'],

  // Reputation router — Rankings owns it broadly; Guests owns its churn sub-tree
  // (and the winback offers it issues from that table).
  '/rankings': ['/api/reputation'],
  '/guests':   ['/api/reputation/guests', '/api/winback'],

  // Reports router — Reports broadly; Variance owns its one sub-path.
  '/reports':  ['/api/reports'],
  '/variance': ['/api/reports/food-cost-variance'],

  // Insights router — split by sub-path between Economics and Menu Insights.
  '/economics':     ['/api/insights/economics'],
  '/menu-insights': ['/api/insights/menu', '/api/insights/cross-sell', '/api/insights/new-items', '/api/insights/service-hours'],

  // Compliance router — Playbook (SOPs) owns its sub-tree; the rest is Compliance.
  '/compliance': ['/api/compliance'],
  '/sops':       ['/api/compliance/sops'],

  // Guest-menu router — the Nutrition card owns its sub-path; the rest is Menu Card.
  '/menu-card':           ['/api/guestmenu'],
  '/menu-card/nutrition': ['/api/guestmenu/nutrition'],
};

// Flattened to { prefix, feature }, longest prefix first so the most specific
// sub-path wins over the router it nests inside.
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
