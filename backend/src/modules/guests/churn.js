/**
 * Churn risk & reorder prediction (LoopAI F-04).
 *
 * The winback list (repeat.js) flags a guest who has not returned in a flat 30
 * days. That number is the same for a daily coffee regular and a monthly
 * date-night couple, which makes it wrong for almost everyone: the coffee
 * regular is a churn risk at a week, the couple is not lapsed at five. This
 * predicts from each guest's OWN cadence instead — the median gap between their
 * visits — so "overdue" means overdue *for them*.
 *
 * The discipline the rest of the system follows applies here too:
 *
 *   - **It abstains on thin history.** A guest with one or two visits has no
 *     cadence to be measured against; they are reported as such, never given a
 *     churn verdict pulled from a single interval.
 *   - **It never projects money.** Value at risk is what a lapsing guest HAS
 *     spent, not a modelled lifetime value — the same rule repeat.js holds to.
 *   - **The prediction is explainable.** "Usually every 9 days, 23 days since"
 *     is the whole model; there is no black box, only the guest's own rhythm.
 *
 * Pure — the caller supplies rows and `now`. Phone is the identity key, the way
 * the recsys notes mark it as the unit for repeat visits.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Below this many visits there is no cadence: two visits give one interval,
// which is a single observation, not a rhythm. Three give two intervals — the
// least that can disagree with itself.
const MIN_ORDERS_FOR_CADENCE = 3;

// Overdue bands, as multiples of the guest's own median cadence.
const DUE_AT = 1.0;         // around when they normally return
const OVERDUE_AT = 1.5;     // past their window — a churn risk
const LIKELY_LOST_AT = 3.0; // three cycles missed — likely gone

const toTime = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const round2 = (n) => Math.round(n * 100) / 100;

function median(sortedNums) {
  const n = sortedNums.length;
  if (!n) return null;
  const mid = Math.floor(n / 2);
  return n % 2 ? sortedNums[mid] : (sortedNums[mid - 1] + sortedNums[mid]) / 2;
}

function classify(overdueRatio) {
  if (overdueRatio < DUE_AT) return 'active';
  if (overdueRatio < OVERDUE_AT) return 'due';
  if (overdueRatio < LIKELY_LOST_AT) return 'overdue';
  return 'likely_lost';
}

/**
 * @param rows [{ customerId, phone, name, orderDates: ISO[]|Date[], totalSpend }]
 *             — one row per identified guest, their paid-order timestamps.
 */
function buildChurnPredictions(rows = [], now = Date.now()) {
  const customers = rows.map((row) => {
    const dates = (row.orderDates || []).map(toTime).filter(Number.isFinite).sort((a, b) => a - b);
    const visits = dates.length;
    const lastVisit = visits ? dates[visits - 1] : null;
    const totalSpend = round2(Number(row.totalSpend) || 0);
    const daysSince = lastVisit === null ? null : Math.floor((now - lastVisit) / DAY_MS);

    const base = {
      customerId: row.customerId,
      phone: row.phone,
      name: row.name || null,
      whatsappOptIn: row.whatsappOptIn === true,
      visits,
      lastVisit: lastVisit === null ? null : new Date(lastVisit).toISOString(),
      daysSince,
      totalSpend,
      avgSpend: visits > 0 ? round2(totalSpend / visits) : 0,
    };

    if (visits < MIN_ORDERS_FOR_CADENCE) {
      return {
        ...base,
        cadenceDays: null, regularity: null, overdueRatio: null,
        predictedNextOrder: null, daysUntilPredicted: null,
        status: 'insufficient_history',
      };
    }

    const intervals = [];
    for (let i = 1; i < dates.length; i += 1) intervals.push((dates[i] - dates[i - 1]) / DAY_MS);
    const cadence = median([...intervals].sort((a, b) => a - b));

    // Regularity from the coefficient of variation of the gaps — a regular
    // guest overdue is a far stronger signal than an erratic one, and the label
    // says which we are looking at rather than hiding it in the ranking.
    const mean = intervals.reduce((s, x) => s + x, 0) / intervals.length;
    const sd = Math.sqrt(intervals.reduce((s, x) => s + (x - mean) ** 2, 0) / intervals.length);
    const cv = mean > 0 ? sd / mean : null;
    const regularity = cv === null ? null : cv <= 0.5 ? 'regular' : cv <= 1 ? 'variable' : 'erratic';

    const overdueRatio = cadence > 0 ? daysSince / cadence : null;
    const status = overdueRatio === null ? 'insufficient_history' : classify(overdueRatio);
    const predictedMs = lastVisit + cadence * DAY_MS;

    return {
      ...base,
      cadenceDays: Math.round(cadence),
      regularity,
      cv: cv === null ? null : round2(cv),
      overdueRatio: overdueRatio === null ? null : round2(overdueRatio),
      predictedNextOrder: new Date(predictedMs).toISOString(),
      daysUntilPredicted: Math.round((predictedMs - now) / DAY_MS),
      status,
    };
  });

  const withCadence = customers.filter((c) => c.status !== 'insufficient_history');
  const atRisk = withCadence
    .filter((c) => c.status === 'overdue' || c.status === 'likely_lost')
    // Most valuable churn first — the returning-customer value is the point.
    .sort((a, b) => b.totalSpend - a.totalSpend);
  const dueSoon = withCadence
    .filter((c) => c.status === 'due')
    .sort((a, b) => a.daysUntilPredicted - b.daysUntilPredicted);

  return {
    minOrdersForCadence: MIN_ORDERS_FOR_CADENCE,
    predictableGuests: withCadence.length,
    insufficientHistory: customers.length - withCadence.length,
    atRisk,
    atRiskCount: atRisk.length,
    // Historic spend of the at-risk guests — value that walks if they do not
    // return. Never a projection of what winning them back is worth.
    atRiskHistoricSpend: round2(atRisk.reduce((s, c) => s + c.totalSpend, 0)),
    dueSoon,
    dueSoonCount: dueSoon.length,
    // Everyone with a cadence, soonest-to-return-or-most-overdue first, for the
    // full segment view.
    guests: withCadence.sort((a, b) => (b.overdueRatio ?? 0) - (a.overdueRatio ?? 0)),
  };
}

module.exports = {
  buildChurnPredictions,
  classify,
  MIN_ORDERS_FOR_CADENCE,
  DUE_AT,
  OVERDUE_AT,
  LIKELY_LOST_AT,
};
