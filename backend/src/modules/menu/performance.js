/**
 * Menu Engineering Matrix — ported from `src/modules/menu/performance.ts`.
 *
 * The source's `buildMenuEngineeringMatrix` was already pure and comes across
 * nearly verbatim, including the bug fix its comments record. The fetching half
 * became a SQL aggregate in insights.repository.js.
 *
 * Classification is volume × unit margin, each split at the median of THIS
 * restaurant's own menu. Absolute thresholds ("high margin is above 60%") don't
 * survive contact with different cuisines and price points; a median splits the
 * menu against itself, which is the comparison an operator can actually act on.
 */

/**
 * Shape raw per-item sales into the performance rows the matrix classifies.
 *
 * `cost_per_unit` of 0 means "not costed", not "free". POS derives it from the
 * dish's recipe, so a dish with no recipe attached has no cost — a real and
 * common state on a menu that is still being built out.
 */
function buildPerformance(rows, { spanDays = 0 } = {}) {
  const performance = rows.map((r) => {
    const price = Number(r.selling_price || 0);
    const cost = Number(r.cost_per_unit || 0);
    const hasCost = cost > 0;
    const quantity = Number(r.total_sold || 0);
    const revenue = Number(r.revenue || 0);

    // Margin is only meaningful where a cost exists. Left at 0 otherwise, and
    // the matrix excludes those rows entirely — see buildMatrix.
    const profitMargin = price > 0 && hasCost ? ((price - cost) / price) * 100 : 0;
    const totalCost = cost * quantity;

    return {
      id: r.id,
      name: r.name,
      category: r.category,
      sellingPrice: price,
      unitCost: cost,
      hasCost,
      totalSold: quantity,
      revenue,
      totalCost,
      profit: revenue - totalCost,
      profitMargin,
      avgDailyOrders: spanDays > 0 ? quantity / spanDays : 0,
    };
  });

  return performance;
}

/**
 * Split the menu into the four quadrants.
 *
 * Uncosted dishes are excluded and counted separately rather than classified.
 * The source records exactly why, and it is worth keeping: their placeholder
 * margin of 0 would either dump them all into "low margin" or — worse — tie the
 * median at 0 and drag every zero-sales dish into "high margin" alongside them,
 * which is how an earlier version landed the entire menu in Stars. The page
 * prompts the operator to cost them instead of guessing on their behalf.
 */
function buildMatrix(performance) {
  const costed = performance.filter((p) => p.hasCost);
  const uncosted = performance.filter((p) => !p.hasCost);

  const empty = {
    stars: [], plowhorses: [], puzzles: [], dogs: [],
    uncostedCount: uncosted.length,
    costedCount: costed.length,
    medianVolume: null,
    medianMargin: null,
  };
  if (costed.length === 0) return empty;

  const sortedByVolume = [...costed].sort((a, b) => a.totalSold - b.totalSold);
  const sortedByMargin = [...costed].sort((a, b) => a.profitMargin - b.profitMargin);

  const medianVolume = sortedByVolume[Math.floor(sortedByVolume.length / 2)].totalSold;
  const medianMargin = sortedByMargin[Math.floor(sortedByMargin.length / 2)].profitMargin;

  // A dish that sold nothing is never "high volume", whatever the median is.
  // Guards the case where the median itself lands on 0.
  const isHighVolume = (p) => p.totalSold > 0 && p.totalSold >= medianVolume;

  return {
    // High volume, high margin — protect these.
    stars: costed.filter((p) => isHighVolume(p) && p.profitMargin >= medianMargin),
    // High volume, low margin — popular but thin; reprice or re-cost.
    plowhorses: costed.filter((p) => isHighVolume(p) && p.profitMargin < medianMargin),
    // Low volume, high margin — worth promoting.
    puzzles: costed.filter((p) => !isHighVolume(p) && p.profitMargin >= medianMargin),
    // Low volume, low margin — candidates to cut.
    dogs: costed.filter((p) => !isHighVolume(p) && p.profitMargin < medianMargin),
    uncostedCount: uncosted.length,
    costedCount: costed.length,
    medianVolume,
    medianMargin,
  };
}

module.exports = { buildPerformance, buildMatrix };
