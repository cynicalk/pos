/**
 * Opportunity Score — ranks open actions by estimated rupee impact.
 * Ported from `src/modules/rules/opportunity.ts`, kept pure.
 *
 * The discipline that makes this worth anything: **only rule types with a
 * defensible rupee figure behind them get one.** In the source that was payout
 * variance (the settlement shortfall itself) and cancellations (revenue lost in
 * the window). POS has no settlements yet, so today exactly one rule quantifies:
 * high_cancellation, against real cancelled-order revenue.
 *
 * Everything else — a rating dip, a stalled table — is genuine risk with no
 * honest number attached. Those rank by priority *below* the quantified ones and
 * show no amount at all. An invented "₹12,000 at stake" on a rating alert would
 * make the whole ranking untrustworthy, because the reader cannot tell which
 * figures were measured.
 */

const PRIORITY_WEIGHT = { critical: 3, high: 2, medium: 1, low: 0 };

/**
 * @param actions  open actions, each { id, rule_type, priority }
 * @param inputs   measured figures: { cancellationLoss }
 * @returns Map actionId -> { amount: number|null, basis: string|null }
 */
function estimateOpportunities(actions, inputs = {}) {
  const cancellationLoss = Number(inputs.cancellationLoss || 0);
  const estimates = new Map();

  for (const action of actions) {
    if (action.rule_type === 'high_cancellation' && cancellationLoss > 0) {
      estimates.set(action.id, {
        amount: cancellationLoss,
        basis: 'revenue on cancelled orders, last 30 days',
      });
    } else {
      // No honest estimate. Deliberately not zero — zero would sort as
      // "nothing at stake" rather than "we cannot say".
      estimates.set(action.id, { amount: null, basis: null });
    }
  }
  return estimates;
}

/** Quantified rupee impact first, then priority, then newest. */
function opportunityRank(a, b, estimates) {
  const amountA = estimates.get(a.id)?.amount ?? -1;
  const amountB = estimates.get(b.id)?.amount ?? -1;
  if (amountA !== amountB) return amountB - amountA;

  const weightA = PRIORITY_WEIGHT[a.priority] ?? 0;
  const weightB = PRIORITY_WEIGHT[b.priority] ?? 0;
  if (weightA !== weightB) return weightB - weightA;

  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
}

/** Sorted copy of `actions`, each annotated with its estimate. */
function rankActions(actions, inputs = {}) {
  const estimates = estimateOpportunities(actions, inputs);
  return [...actions]
    .sort((a, b) => opportunityRank(a, b, estimates))
    .map((a) => ({ ...a, opportunity: estimates.get(a.id) || { amount: null, basis: null } }));
}

module.exports = { PRIORITY_WEIGHT, estimateOpportunities, opportunityRank, rankActions };
