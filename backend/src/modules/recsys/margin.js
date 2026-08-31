/**
 * Reco → margin loop — pure join of what the recommender pushes against the
 * menu-engineering matrix.
 *
 * Phase 0 logging tells us which dishes guests actually add from a pick
 * (`dish_added`, source = 'reco'). This asks the operator's real question of that
 * signal: are the picks that land in carts our *profitable* dishes, or is the
 * recommender quietly filling baskets with plowhorses and dogs? Each recommended
 * dish is tagged with the quadrant it already sits in (stars / plowhorses /
 * puzzles / dogs, split at this menu's own medians — see modules/menu/performance)
 * and its unit margin, then the reco-driven adds are summed by quadrant.
 *
 * The discipline holds two ways:
 *   - A dish with no recipe cost has no margin and no quadrant. It is never
 *     scored; it is counted as "uncosted" so the coverage is visible, exactly as
 *     the menu-engineering page does. We do not guess a margin to fill the table.
 *   - Below a floor of reco-driven adds the split is noise, so we abstain on the
 *     verdict and show the counts only.
 *
 * Inputs:
 *   dishStats   : [{ menuItemId, dishName, recoAdds, recoRemoves }]
 *   matrix      : output of modules/menu/performance.buildMatrix
 *   impressions : [{ menuItemId, impressions }] — times each dish was shown, from
 *                 recommendations_shown.dishIds. Optional; a dish with no
 *                 impression rows reports a null conversion rather than a fake one.
 */

// Below this many net reco-driven adds, the quadrant split is not worth a verdict.
const MIN_RECO_ADDS = 15;

const CLASS_MARGIN = { stars: 'high', puzzles: 'high', plowhorses: 'low', dogs: 'low' };
const QUADRANTS = ['stars', 'plowhorses', 'puzzles', 'dogs'];

const n = (v) => Number(v || 0);

/** Build id → { class, profitMargin } from the four matrix buckets. */
function indexMatrix(matrix) {
  const byId = new Map();
  for (const q of QUADRANTS) {
    for (const item of matrix?.[q] || []) {
      byId.set(item.id, { class: q, profitMargin: item.profitMargin });
    }
  }
  return byId;
}

function buildRecoMargin(dishStats = [], matrix = {}, impressions = []) {
  const byId = indexMatrix(matrix);
  const impById = new Map(impressions.map((i) => [i.menuItemId, n(i.impressions)]));

  const dishes = [];
  let uncosted = 0;

  for (const d of dishStats) {
    const net = n(d.recoAdds) - n(d.recoRemoves);
    if (net <= 0) continue; // a dish added then removed nets out — not "pushed"
    const shown = impById.get(d.menuItemId) || 0;
    // Impression → add conversion, only where the dish was actually shown. No
    // impressions logged for it yet → null, never a rate over a zero base.
    const conversion = shown > 0 ? Math.min(100, Math.round((net / shown) * 1000) / 10) : null;
    const cls = byId.get(d.menuItemId);
    if (!cls) {
      uncosted += net;
      dishes.push({
        menuItemId: d.menuItemId,
        dishName: d.dishName,
        recoAdds: net,
        impressions: shown,
        conversion,
        class: null,
        marginBand: null,
        profitMargin: null,
      });
      continue;
    }
    dishes.push({
      menuItemId: d.menuItemId,
      dishName: d.dishName,
      recoAdds: net,
      impressions: shown,
      conversion,
      class: cls.class,
      marginBand: CLASS_MARGIN[cls.class],
      profitMargin: cls.profitMargin,
    });
  }

  dishes.sort((a, b) => b.recoAdds - a.recoAdds);

  // Reco-driven adds summed by quadrant (only the costed, classified ones).
  const byClass = { stars: 0, plowhorses: 0, puzzles: 0, dogs: 0 };
  for (const d of dishes) if (d.class) byClass[d.class] += d.recoAdds;

  const classified = byClass.stars + byClass.plowhorses + byClass.puzzles + byClass.dogs;
  const highMargin = byClass.stars + byClass.puzzles;
  const lowMargin = byClass.plowhorses + byClass.dogs;

  const enoughData = classified >= MIN_RECO_ADDS;
  const highMarginShare =
    enoughData && classified > 0 ? Math.round((highMargin / classified) * 1000) / 10 : null;

  // A single honest verdict: is the recommender steering carts toward margin?
  let verdict = null;
  if (enoughData) {
    if (highMarginShare >= 60) verdict = 'healthy';
    else if (highMarginShare >= 40) verdict = 'mixed';
    else verdict = 'margin_leak';
  }

  const totalImpressions = dishes.reduce((s, d) => s + d.impressions, 0);

  return {
    enoughData,
    learning: enoughData ? null : { minRecoAdds: MIN_RECO_ADDS, have: classified },
    byClass,
    classifiedAdds: classified,
    uncostedAdds: uncosted,
    highMarginShare,
    verdict,
    // The impression → add column only appears once dishIds are being logged;
    // before that the page shows adds alone rather than a column full of dashes.
    hasImpressions: totalImpressions > 0,
    dishes,
  };
}

module.exports = { buildRecoMargin, MIN_RECO_ADDS };
