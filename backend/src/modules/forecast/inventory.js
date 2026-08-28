/**
 * Level 3, projected forward — stock against the forecast (docs/FORECASTING.md §III.3, §IV).
 *
 * The prep sheet answers "how much of each ingredient does tomorrow need". This
 * module carries that one step further: given how much is on hand and how much
 * each of the next N days is forecast to consume, it walks the stock down day by
 * day and reports where it crosses the reorder level and where it would hit
 * zero. Auto-reorder is the same walk read at the lead time.
 *
 * The discipline from prep.js still holds:
 *
 *   - **It never invents demand it cannot trace.** An ingredient only used by
 *     dishes with no recipe, or by dishes the mix routes out as intermittent,
 *     draws no forecast consumption here. That ingredient is reported as "not
 *     drawn by the forecast" — its stock is shown, but no depletion date is
 *     guessed, because guessing one would be a confident line with nothing under
 *     it.
 *
 *   - **It does not pretend to know shelf life.** A reorder quantity is the
 *     operator's own configured `reorder_qty`, or, where they set none, the
 *     amount that covers the forecast demand over the lead-and-review window.
 *     For a perishable, if that quantity would sit longer than a few days of
 *     forecast demand, it is flagged as a waste risk rather than silently
 *     suggested — the newsvendor trade-off (§IV.1) is the operator's, not ours.
 */

// A perishable order that covers more than this many days of forecast demand is
// flagged: past here the risk tips from stockout toward spoilage, and only the
// operator holds the shelf-life to judge it.
const PERISHABLE_COVER_DAYS = 5;

/**
 * Walk each ingredient's stock down against its forecast daily consumption.
 *
 * @param ingredients  [{ id, name, unit, stockOnHand, reorderLevel, reorderQty,
 *                        unitCost, perishable }]
 * @param consumption  { [ingredientId]: number[] } — forecast consumption per day,
 *                     length `horizonDays`, index 0 = the first forecast day.
 * @param horizonDays  how many days forward the walk covers.
 */
function project(ingredients, consumption, horizonDays) {
  return ingredients
    .map((ing) => {
      const daily = (consumption[ing.id] || []).slice(0, horizonDays);
      const totalConsumption = daily.reduce((s, q) => s + q, 0);
      const drawnByForecast = totalConsumption > 1e-9;

      // Running stock at the END of each forecast day.
      const running = [];
      let stock = ing.stockOnHand;
      for (let d = 0; d < horizonDays; d += 1) {
        stock -= daily[d] || 0;
        running.push(stock);
      }

      // First day (1-indexed) the running stock is at or below each threshold.
      const firstDayAtOrBelow = (level) => {
        for (let d = 0; d < running.length; d += 1) {
          if (running[d] <= level) return d + 1;
        }
        return null;
      };

      // Already at or below the reorder level before a single day is forecast is
      // a distinct, more urgent fact than crossing it mid-horizon.
      const belowReorderNow = ing.stockOnHand <= ing.reorderLevel;
      const daysToReorderLevel = belowReorderNow ? 0 : firstDayAtOrBelow(ing.reorderLevel);
      const daysToStockout = ing.stockOnHand <= 0 ? 0 : firstDayAtOrBelow(0);

      const dailyBurn = drawnByForecast ? totalConsumption / horizonDays : 0;

      let status;
      if (!drawnByForecast) status = 'no_forecast_demand';
      else if (belowReorderNow) status = 'below_reorder_now';
      else if (daysToStockout !== null) status = 'stockout_within_horizon';
      else if (daysToReorderLevel !== null) status = 'reorder_within_horizon';
      else status = 'ok';

      return {
        id: ing.id,
        name: ing.name,
        unit: ing.unit,
        perishable: !!ing.perishable,
        stockOnHand: ing.stockOnHand,
        reorderLevel: ing.reorderLevel,
        reorderQty: ing.reorderQty,
        unitCost: ing.unitCost,
        drawnByForecast,
        totalConsumption,
        dailyBurn,
        projectedEndStock: running.length ? running[running.length - 1] : ing.stockOnHand,
        daysToReorderLevel,
        daysToStockout,
        status,
        running,
      };
    })
    // Soonest to run out first; ingredients the forecast cannot speak to sink to
    // the bottom rather than jostling with real depletion dates — even one that
    // happens to sit below its reorder level today, because we still cannot say
    // when it depletes.
    .sort((a, b) => {
      const rank = (p) => (!p.drawnByForecast ? 1e9 : (p.daysToStockout ?? p.daysToReorderLevel ?? 1e6));
      return rank(a) - rank(b);
    });
}

/**
 * The reorder plan: the subset of the projection that needs an order placed
 * within the lead time, each with a suggested quantity and an honest label.
 *
 * @param projection  output of `project`.
 * @param leadDays    supplier lead time in days (the "h" the plan reorders at).
 * @param reviewDays  how long after delivery until the next order can land;
 *                    the suggested quantity aims to cover lead + review demand.
 */
function reorderPlan(projection, { leadDays = 3, reviewDays = 4 } = {}) {
  const suggestions = [];

  for (const p of projection) {
    if (!p.drawnByForecast) continue;

    // Reorder if it is already at/below the level, or will cross it within the
    // lead time — after that point an order placed today arrives too late.
    const crossesWithinLead =
      p.daysToReorderLevel !== null && p.daysToReorderLevel <= leadDays;
    if (!crossesWithinLead) continue;

    // The demand-based need: cover the lead-and-review window and land back at
    // the reorder level. Never negative.
    const coverDays = leadDays + reviewDays;
    const demandOverCover = p.dailyBurn * coverDays;
    const demandNeed = Math.max(0, demandOverCover + p.reorderLevel - p.stockOnHand);

    // Prefer the operator's own configured quantity; fall back to the demand
    // need where they set none (reorder_qty of zero = "not configured").
    const usingConfiguredQty = Number(p.reorderQty) > 0;
    const suggestedQty = usingConfiguredQty ? Number(p.reorderQty) : demandNeed;

    const coversDays = p.dailyBurn > 0 ? suggestedQty / p.dailyBurn : null;
    const perishableWasteRisk =
      p.perishable && coversDays !== null && coversDays > PERISHABLE_COVER_DAYS;

    suggestions.push({
      id: p.id,
      name: p.name,
      unit: p.unit,
      perishable: p.perishable,
      stockOnHand: p.stockOnHand,
      reorderLevel: p.reorderLevel,
      dailyBurn: p.dailyBurn,
      daysToReorderLevel: p.daysToReorderLevel,
      daysToStockout: p.daysToStockout,
      suggestedQty,
      suggestedCost: suggestedQty * Number(p.unitCost || 0),
      coversDays,
      qtyBasis: usingConfiguredQty ? 'configured_reorder_qty' : 'forecast_demand',
      demandNeed,
      perishableWasteRisk,
      urgency: p.daysToReorderLevel === 0 ? 'now' : 'soon',
    });
  }

  // Most urgent first, then by the cost of the order so the biggest commitments
  // are visible at the top of a same-urgency band.
  return suggestions.sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency === 'now' ? -1 : 1;
    return b.suggestedCost - a.suggestedCost;
  });
}

module.exports = { project, reorderPlan, PERISHABLE_COVER_DAYS };
