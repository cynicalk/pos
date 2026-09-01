/**
 * Autopilot policy — pure decision, no side effects.
 *
 * Decides whether to auto-feature a dish, given the current recommender state and
 * what autopilot has already done. The guardrails ARE the policy: it acts only
 * when every condition holds, so the caller can execute the result without
 * re-checking. Kept pure and small so the guardrails are trivially testable —
 * this is the one place the product acts on its own, and it must be provably tame.
 *
 * It will feature ONE dish per run, and only when:
 *   - autopilot is enabled, and
 *   - the recommender's margin verdict is a confirmed leak, and
 *   - fewer than `maxActive` dishes are currently autopilot-featured (a cap so it
 *     can never run away), and
 *   - there's an unfeatured high-margin puzzle to promote that autopilot hasn't
 *     already acted on.
 *
 * Inputs:
 *   enabled     boolean
 *   marginVerdict  the reco margin verdict ('margin_leak' | …)
 *   promote     the reco promote candidates [{ menuItemId, dishName, profitMargin, featured }]
 *   activeCount how many dishes autopilot currently has featured (from the log)
 *   actedIds    Set of menu_item ids autopilot has ever featured (avoid re-acting)
 */
const MAX_ACTIVE = 2;

function decideFeatureAction(input = {}) {
  const { enabled, marginVerdict, promote = [], activeCount = 0, actedIds = new Set(), maxActive = MAX_ACTIVE } = input;
  if (!enabled) return null;
  if (marginVerdict !== 'margin_leak') return null;
  if (activeCount >= maxActive) return null;

  const candidate = promote
    .filter((p) => !p.featured && !actedIds.has(p.menuItemId) && p.profitMargin != null)
    .sort((a, b) => b.profitMargin - a.profitMargin)[0];
  if (!candidate) return null;

  return {
    actionType: 'feature_dish',
    menuItemId: candidate.menuItemId,
    dishName: candidate.dishName,
    detail:
      `Auto-featured ${candidate.dishName} (${Math.round(candidate.profitMargin)}% margin): the recommender ` +
      `was leaking margin and this high-margin dish was going unshown.`,
  };
}

module.exports = { decideFeatureAction, MAX_ACTIVE };
