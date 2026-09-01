/**
 * Two deeper reads over the reco log, both pure and both abstaining on thin data.
 *
 * 1. Revenue attribution — the number the count-based funnel was missing. Each
 *    order_placed event carries the bill total and the share of its items that
 *    came from a pick (recoShare), so we can say how many rupees the recommender
 *    actually moved, and whether tables that used the picks spent more per order
 *    than tables that didn't. The AOV-lift comparison abstains until each side has
 *    enough orders to be worth comparing — a lift off three orders is noise.
 *
 * 2. Segmented funnels — the same saw→added→accepted→ordered funnel split by a
 *    key (the occasion the table checked in as; its size once that's logged), so
 *    "date-night accepts 70%, families 38%" is visible. Each segment abstains
 *    below its own session floor, so a rarely-seen segment shows counts, not a
 *    confident-looking rate.
 */

const MIN_ORDERS_FOR_AOV = 10; // per side, before an AOV comparison means anything
const MIN_SEGMENT_SESSIONS = 15; // before a segment's rates are worth showing

const n = (v) => Number(v || 0);
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

function buildRevenueAttribution(row = {}) {
  const orders = n(row.orders);
  const totalRevenue = round2(row.total_revenue);
  const recoRevenue = round2(row.reco_revenue);
  const recoOrders = n(row.reco_orders);
  const nonRecoOrders = n(row.nonreco_orders);

  const aovReco = recoOrders >= MIN_ORDERS_FOR_AOV ? round2(n(row.reco_order_revenue) / recoOrders) : null;
  const aovNonReco = nonRecoOrders >= MIN_ORDERS_FOR_AOV ? round2(n(row.nonreco_order_revenue) / nonRecoOrders) : null;
  const aovLift = aovReco != null && aovNonReco != null ? round2(aovReco - aovNonReco) : null;
  const aovLiftPct = aovLift != null && aovNonReco > 0 ? Math.round((aovLift / aovNonReco) * 1000) / 10 : null;

  return {
    orders,
    // Revenue the app booked in this window (its own bill total, an estimate, not
    // the POS's settled figure — labelled as such on the page).
    totalRevenue,
    // Rupees attributable to the picks: each order's total times its reco share.
    recoRevenue,
    recoRevenuePct: pct(recoRevenue, totalRevenue),
    // Do tables that used the picks spend more per order? Both sides abstain until
    // there are enough orders to compare.
    aovReco,
    aovNonReco,
    aovLift,
    aovLiftPct,
    enoughForAov: aovReco != null && aovNonReco != null,
  };
}

function buildSegments(rows = []) {
  return rows
    .map((r) => {
      const saw = n(r.saw);
      const adds = n(r.adds);
      const enough = saw >= MIN_SEGMENT_SESSIONS;
      return {
        segment: r.segment || 'unknown',
        sessions: saw,
        enoughData: enough,
        acceptancePct: enough ? pct(n(r.adds_reco), adds) : null,
        conversionPct: enough ? pct(n(r.ordered), saw) : null,
        ordered: n(r.ordered),
      };
    })
    .sort((a, b) => b.sessions - a.sessions);
}

/**
 * Refine-loop health. If tables that had to refine the picks convert as well as
 * or better than those who didn't, refining is doing its job; if they convert
 * WORSE, the FIRST set of picks is the problem — the model's opening guess is
 * off. Both conversion rates abstain below a floor so a handful of refiners
 * doesn't manufacture a verdict.
 */
const MIN_REFINE_SESSIONS = 15;

function buildRefineStats(row = {}) {
  const sessions = n(row.sessions);
  const refined = n(row.refined_sessions);
  const unrefined = sessions - refined;

  const refinedConv = refined >= MIN_REFINE_SESSIONS ? pct(n(row.refined_ordered), refined) : null;
  const unrefinedConv = unrefined >= MIN_REFINE_SESSIONS ? pct(n(row.unrefined_ordered), unrefined) : null;

  let verdict = null;
  if (refinedConv != null && unrefinedConv != null) {
    // A meaningful gap either way; within a few points is "no difference".
    if (refinedConv <= unrefinedConv - 8) verdict = 'first_picks_weak';
    else if (refinedConv >= unrefinedConv + 8) verdict = 'refine_helps';
    else verdict = 'similar';
  }

  return {
    sessions,
    refinedSessions: refined,
    refineRate: pct(refined, sessions),
    refinedConversionPct: refinedConv,
    unrefinedConversionPct: unrefinedConv,
    verdict,
  };
}

/**
 * The A/B holdout read: control (plain model) vs treatment (featured + learned
 * prior), on the same acceptance and conversion, plus the lift and whether the
 * acceptance difference is statistically significant. This is the only honest
 * answer to "does the recommender's smarts actually help" — everything else
 * assumes it. Abstains until BOTH arms have enough sessions.
 */
const { twoProportionZ } = require('./stats');
const MIN_ARM_SESSIONS = 20;

function buildExperiment(rows = []) {
  const byArm = new Map(rows.map((r) => [r.segment, r]));
  const control = byArm.get('control');
  const treatment = byArm.get('treatment');

  const arm = (r) => {
    if (!r) return { sessions: 0, acceptancePct: null, conversionPct: null };
    const saw = n(r.saw);
    const enough = saw >= MIN_ARM_SESSIONS;
    return {
      sessions: saw,
      acceptancePct: enough ? pct(n(r.adds_reco), n(r.adds)) : null,
      conversionPct: enough ? pct(n(r.ordered), saw) : null,
    };
  };

  const c = arm(control);
  const t = arm(treatment);
  const enoughData = c.acceptancePct != null && t.acceptancePct != null;

  let acceptanceLift = null;
  let significant = false;
  if (enoughData) {
    acceptanceLift = Math.round((t.acceptancePct - c.acceptancePct) * 10) / 10;
    significant = twoProportionZ(
      n(treatment.adds_reco), n(treatment.adds), n(control.adds_reco), n(control.adds),
    ).significant;
  }

  return {
    enoughData,
    control: c,
    treatment: t,
    acceptanceLift,     // treatment − control, in points
    significant,
  };
}

/**
 * How concentrated the reco-driven adds are across the menu — a cannibalization
 * signal. Featuring and the learned prior push volume toward a few dishes; if
 * they push it too hard, a handful of dishes soak up every add and the rest
 * starve. The Herfindahl index (sum of squared shares, 0→perfectly spread,
 * 1→one dish takes everything) and the single top dish's share make that visible,
 * so an operator can see the lever concentrating demand before it cannibalizes.
 * `dishStats` is the per-dish reco-add rows; abstains below a floor of total adds.
 */
const MIN_ADDS_FOR_CONCENTRATION = 20;
function buildConcentration(dishStats = []) {
  const adds = dishStats.map((d) => Math.max(0, n(d.recoAdds))).filter((a) => a > 0);
  const total = adds.reduce((s, a) => s + a, 0);
  if (total < MIN_ADDS_FOR_CONCENTRATION) {
    return { enoughData: false, hhi: null, topSharePct: null, dishes: adds.length };
  }
  const shares = adds.map((a) => a / total);
  const hhi = Math.round(shares.reduce((s, x) => s + x * x, 0) * 1000) / 1000;
  const topSharePct = Math.round(Math.max(...shares) * 1000) / 10;
  return { enoughData: true, hhi, topSharePct, dishes: adds.length };
}

module.exports = {
  buildRevenueAttribution,
  buildSegments,
  buildRefineStats,
  buildExperiment,
  buildConcentration,
  MIN_ORDERS_FOR_AOV,
  MIN_SEGMENT_SESSIONS,
  MIN_REFINE_SESSIONS,
  MIN_ARM_SESSIONS,
};
