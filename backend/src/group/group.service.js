const repo = require('./group.repository');
const rollup = require('../modules/group/rollup');
const opportunity = require('../modules/rules/opportunity');
const engine = require('../modules/rules/engine');

/*
 * Multi-outlet rollup (MERGE_PLAN.md Phase 7).
 *
 * Fetch set-based per-outlet aggregates → assemble with the pure module → hand
 * back. No figure is invented here; `atStake` runs through the same
 * estimateOpportunities the outlet's own Actions page uses, so a group total is
 * always a sum of numbers the operator can click into and check.
 */

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

// How many open findings the merged queue carries. A group of ten outlets can
// have hundreds; the page is for deciding where to go today, not for reading
// every finding, and each outlet's own Actions page still has all of them.
const ATTENTION_LIMIT = 50;

const clampDays = (days) => {
  const n = parseInt(days, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAYS;
  return Math.min(n, MAX_DAYS);
};

const byOutlet = (rows) => Object.fromEntries(rows.map((r) => [r.restaurant_id, r]));

/**
 * The group view for one user.
 *
 * @param {{ userId, restaurantId }} user  the authenticated user as the auth
 *        middleware builds it. The grant boundary is applied from their id,
 *        never from a parameter they sent.
 */
async function getRollup(user, { days } = {}) {
  const windowDays = clampDays(days);

  const [outlets, organization, orgOutletCount] = await Promise.all([
    repo.listVisibleOutlets(user.userId, user.restaurantId),
    repo.getOrganization(user.restaurantId),
    repo.countOrgOutlets(user.restaurantId),
  ]);

  const outletIds = outlets.map((o) => o.id);
  if (!outletIds.length) {
    // Cannot happen through the router (a user always has their own outlet) but
    // returning an empty shape beats letting ANY($1) run on an empty array.
    return emptyRollup(organization, windowDays, orgOutletCount, 0);
  }

  const [orderRows, revenueRows, foodRows, ratingRows, actionCountRows, openActions] =
    await Promise.all([
      repo.getOrderStats(outletIds, windowDays),
      repo.getRevenue(outletIds, windowDays),
      repo.getFoodCost(outletIds, windowDays),
      repo.getRatings(outletIds, engine.RATING_WINDOW),
      repo.getActionCounts(outletIds),
      repo.listOpenActions(outletIds, ATTENTION_LIMIT),
    ]);

  const orders = byOutlet(orderRows);
  const actionCounts = byOutlet(actionCountRows);

  // Price each outlet's findings with the shared estimator, using that outlet's
  // own measured cancellation loss. Running it per outlet rather than once over
  // the pooled actions is the whole point: an action belongs to one outlet, and
  // its rupee figure comes from that outlet's numbers.
  const actionsByOutlet = {};
  for (const outlet of outlets) {
    const outletActions = openActions.filter((a) => a.restaurant_id === outlet.id);
    const estimates = opportunity.estimateOpportunities(outletActions, {
      cancellationLoss: Number(orders[outlet.id]?.lost_revenue || 0),
    });

    let atStake = 0;
    let unquantified = 0;
    for (const action of outletActions) {
      const amount = estimates.get(action.id)?.amount;
      if (amount === null || amount === undefined) unquantified += 1;
      else atStake += Number(amount);
    }

    const counts = actionCounts[outlet.id];
    actionsByOutlet[outlet.id] = {
      open_actions:   counts ? counts.open_actions : 0,
      urgent_actions: counts ? counts.urgent_actions : 0,
      at_stake:       atStake,
      // Counted over the findings the queue actually carries, which is capped
      // at ATTENTION_LIMIT — so this can understate a very noisy group. It is
      // never an overstatement, which is the direction that matters.
      unquantified,
    };
  }

  const rows = rollup.buildComparison(outlets, {
    orders,
    revenue:  byOutlet(revenueRows),
    foodCost: byOutlet(foodRows),
    ratings:  byOutlet(ratingRows),
    actions:  actionsByOutlet,
  });

  // Attach each action's estimate before merging, so the queue ranks on the
  // same amounts the comparison table summed.
  const priced = openActions.map((action) => {
    const estimates = opportunity.estimateOpportunities([action], {
      cancellationLoss: Number(orders[action.restaurant_id]?.lost_revenue || 0),
    });
    return { ...action, amount: estimates.get(action.id)?.amount ?? null };
  });

  return {
    organization: organization ? { id: organization.id, name: organization.name } : null,
    windowDays,
    totals: rollup.buildTotals(rows),
    outlets: rollup.rankOutlets(rows, actionsByOutlet),
    attention: rollup.mergeAttention(priced),
    attentionLimit: ATTENTION_LIMIT,
    // Whether this user is seeing the whole organization or a granted subset.
    // The page says so: a manager reading "3 outlets" needs to know the group
    // has eight, or they will read their slice as the whole business.
    visibleOutlets: outlets.length,
    orgOutlets: orgOutletCount,
    partialView: outlets.length < orgOutletCount,
  };
}

function emptyRollup(organization, windowDays, orgOutletCount, visible) {
  return {
    organization: organization ? { id: organization.id, name: organization.name } : null,
    windowDays,
    totals: rollup.buildTotals([]),
    outlets: [],
    attention: [],
    attentionLimit: ATTENTION_LIMIT,
    visibleOutlets: visible,
    orgOutlets: orgOutletCount,
    partialView: visible < orgOutletCount,
  };
}

module.exports = { getRollup, DEFAULT_DAYS, ATTENTION_LIMIT };
