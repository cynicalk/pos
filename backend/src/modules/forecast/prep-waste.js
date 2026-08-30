/**
 * Waste Prediction — Phase 2: forecast tomorrow's likely over-prep.
 *
 * Phase 1 made one number exist: how much of each dish was prepped, and so how
 * much went unsold. Once weeks of those triples accumulate, a pattern is
 * legible — some dishes are over-prepped almost every Friday, by roughly the
 * same amount. This module reads that pattern and projects it onto the next
 * service, per dish, bucketed by weekday (the same seasonal structure the
 * demand baseline learns).
 *
 * What it does NOT do is prescribe a prep quantity. Choosing how much to make
 * is a newsvendor decision — it needs the cost of running out weighed against
 * the cost of binning, which needs shelf-life and stockout-cost data the POS
 * does not hold. The forecast sheet already says this in as many words. So this
 * module forecasts the *surplus* and flags dishes that over-prep chronically;
 * the operator still decides, now looking at their own measured gap against the
 * forecast rather than at nothing.
 *
 * Honesty, inherited from the baseline it sits beside:
 *   - A dish with too little history gets no number and a stated reason, never
 *     a zero. Two Fridays is not a pattern.
 *   - "Surplus" is prepped minus sold, floored at zero — the same definition
 *     the reconciliation uses, so the two screens can never disagree.
 *   - Surplus is valued in rupees only where the dish has a recipe cost; where
 *     it does not, the portions stand alone rather than borrowing a guessed price.
 */

const { dayOfWeek, median, quantile } = require('./baseline');

// Overall floor: below this many logged days a dish says nothing, even pooling
// every weekday. Mirrors the baseline's stance that a shape needs samples.
const MIN_DAYS_FOR_DISH = 8;

// A weekday-specific surplus needs its own samples to mean anything; below this
// the dish falls back to its all-weekday surplus and says it has done so.
const MIN_SAMPLES_PER_WEEKDAY = 3;

// Chronic = over-prepped on most days, by a margin that isn't rounding noise.
const CHRONIC_DAY_SHARE = 0.6;   // over-prepped on ≥60% of its logged days
const CHRONIC_MIN_SURPLUS = 1;   // …by at least one whole portion (median)
const CHRONIC_MIN_PCT = 0.12;    // …which is ≥12% of what it typically preps

const round1 = (n) => Math.round((Number(n) + Number.EPSILON) * 10) / 10;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** prepped − sold, never negative: a short day is not negative waste. */
const surplusOf = (d) => Math.max(0, Number(d.prepped) - Number(d.sold));

function withSurplus(days) {
  return (days || [])
    .filter((d) => d && d.prepped != null && d.date)
    .map((d) => ({
      date: d.date,
      dow: dayOfWeek(d.date),
      prepped: Number(d.prepped),
      sold: Number(d.sold) || 0,
      surplus: surplusOf(d),
    }));
}

/**
 * Predict the surplus for one dish on a target weekday.
 *
 * Prefers the dish's own history for that weekday; falls back to all its days
 * when one weekday is too thin; abstains below the overall floor. Returns the
 * median surplus with an interquartile range so the screen can say "typically
 * 3–7 unsold" rather than a false point.
 */
function predictOverPrep(days, targetDow) {
  const rows = withSurplus(days);
  if (rows.length < MIN_DAYS_FOR_DISH) {
    return { surplus: null, reason: 'not_enough_history', days: rows.length, requiredDays: MIN_DAYS_FOR_DISH };
  }

  const sameDow = rows.filter((r) => r.dow === targetDow);
  const enoughForDow = sameDow.length >= MIN_SAMPLES_PER_WEEKDAY;
  const used = enoughForDow ? sameDow : rows;
  const basis = enoughForDow ? 'same_weekday' : 'all_weekday';

  const surpluses = used.map((r) => r.surplus);
  return {
    surplus: round1(median(surpluses)),
    lo: round1(quantile(surpluses, 0.25)),
    hi: round1(quantile(surpluses, 0.75)),
    typicalPrepped: round1(median(used.map((r) => r.prepped))),
    typicalSold: round1(median(used.map((r) => r.sold))),
    basis,
    samples: used.length,
    weekdaySamples: sameDow.length,
    reason: null,
  };
}

/**
 * Is this dish a chronic over-prepper, across all its history (not one weekday)?
 *
 * Deliberately three conditions, all required: it over-preps on most days, the
 * typical surplus is a real portion, and that surplus is a meaningful share of
 * the prep. A dish that leaves half a portion over on 90% of days is not the
 * problem this flag is looking for.
 */
function classifyChronic(days) {
  const rows = withSurplus(days);
  if (rows.length < MIN_DAYS_FOR_DISH) {
    return { chronic: false, overShare: null, medSurplus: null, surplusPct: null, days: rows.length };
  }
  const overDays = rows.filter((r) => r.surplus > 0).length;
  const overShare = overDays / rows.length;
  const medSurplus = median(rows.map((r) => r.surplus));
  const medPrepped = median(rows.map((r) => r.prepped));
  const surplusPct = medPrepped > 0 ? medSurplus / medPrepped : 0;

  const chronic = overShare >= CHRONIC_DAY_SHARE
    && medSurplus >= CHRONIC_MIN_SURPLUS
    && surplusPct >= CHRONIC_MIN_PCT;

  return { chronic, overShare: round2(overShare), medSurplus: round1(medSurplus), surplusPct: round2(surplusPct), days: rows.length };
}

/**
 * Build the whole-menu over-prep forecast for a target date.
 *
 * @param dishes [{ menuItemId, name, days:[{date, prepped, sold}], unitCost?, forecastQty? }]
 * @param targetDate 'YYYY-MM-DD' — the service the forecast is for.
 */
function buildPrepForecast({ dishes = [], targetDate }) {
  const targetDow = dayOfWeek(targetDate);

  const out = dishes.map((dish) => {
    const pred = predictOverPrep(dish.days, targetDow);
    const chr = classifyChronic(dish.days);
    const unitCost = dish.unitCost != null && dish.unitCost > 0 ? Number(dish.unitCost) : null;
    const valuedSurplus = pred.surplus != null && unitCost != null ? round2(pred.surplus * unitCost) : null;

    // A single label the screen sorts and colours on.
    let status;
    if (pred.surplus == null) status = 'insufficient';
    else if (chr.chronic) status = 'chronic';
    else if (pred.surplus >= 1) status = 'occasional';
    else status = 'lean';

    return {
      menuItemId: dish.menuItemId,
      name: dish.name,
      forecastQty: dish.forecastQty ?? null,
      unitCost,
      status,
      chronic: chr.chronic,
      // Prediction for the target weekday.
      predictedSurplus: pred.surplus,
      surplusLo: pred.lo ?? null,
      surplusHi: pred.hi ?? null,
      typicalPrepped: pred.typicalPrepped ?? null,
      typicalSold: pred.typicalSold ?? null,
      valuedSurplus,
      basis: pred.basis ?? null,
      samples: pred.samples ?? pred.days ?? 0,
      weekdaySamples: pred.weekdaySamples ?? 0,
      reason: pred.reason,
      // Chronic stats across all history (context for the flag).
      overShare: chr.overShare,
    };
  });

  // Chronic and heaviest surplus first; dishes we cannot forecast sink to the
  // bottom rather than pretending to a zero surplus.
  const rank = (d) => (d.status === 'insufficient' ? -1 : (d.chronic ? 1e9 : 0) + (d.valuedSurplus ?? d.predictedSurplus ?? 0));
  out.sort((a, b) => rank(b) - rank(a));

  const predicted = out.filter((d) => d.predictedSurplus != null);
  const costed = predicted.filter((d) => d.valuedSurplus != null);

  return {
    targetDate,
    targetDow,
    dishes: out,
    summary: {
      total: out.length,
      predicted: predicted.length,
      insufficient: out.length - predicted.length,
      chronic: out.filter((d) => d.chronic).length,
      // Sum of predicted surplus across dishes we can forecast — a whole-service
      // "likely unsold tomorrow" figure, in portions and (where costed) rupees.
      totalSurplusPortions: round1(predicted.reduce((s, d) => s + d.predictedSurplus, 0)),
      totalSurplusValue: costed.length ? round2(costed.reduce((s, d) => s + d.valuedSurplus, 0)) : null,
      // The share of predicted dishes we could put a price on — so the rupee
      // figure is never read as complete when it isn't.
      valueCoveragePct: predicted.length ? round2((costed.length / predicted.length) * 100) : null,
    },
  };
}

module.exports = {
  buildPrepForecast,
  predictOverPrep,
  classifyChronic,
  surplusOf,
  MIN_DAYS_FOR_DISH,
  MIN_SAMPLES_PER_WEEKDAY,
  CHRONIC_DAY_SHARE,
  CHRONIC_MIN_SURPLUS,
  CHRONIC_MIN_PCT,
};
