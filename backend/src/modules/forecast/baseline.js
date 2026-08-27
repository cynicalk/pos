/**
 * Tier 0 — seasonal naive, weekday × level (docs/FORECASTING.md §III.4).
 *
 * "Twenty lines. Ships first, remains the permanent benchmark and the permanent
 * fallback below 8 weeks of history. Not a placeholder — on daily restaurant
 * data with strong weekday structure it is legitimately strong."
 *
 * This is that model and nothing more. It learns one thing: how much a given
 * weekday trades relative to the recent level. It cannot learn a festival, a
 * heatwave or a promotion, and every consumer of it is told so in the payload
 * rather than being left to assume otherwise.
 *
 * Four decisions here are about honesty rather than accuracy, and each is the
 * one the source document is most insistent about:
 *
 *   - **A closed day is not a day of zero demand** (§III.7). A kitchen shut for
 *     a deep clean traded nothing, and averaging that into the level teaches the
 *     model a dip that never existed. Closed days are excluded from the level
 *     and from the weekday factors, and counted separately so the caller can say
 *     how many were dropped.
 *
 *   - **The band is measured, not assumed** (§III.6). With this little history
 *     any parametric interval is miscalibrated. The interval comes from this
 *     model's own realised errors on a rolling-origin backtest, bucketed by
 *     weekday. If there are too few residuals to form one, there is no band —
 *     not a default one.
 *
 *   - **Refusing is a valid answer.** Below the minimum history, or on a weekday
 *     with too few samples to mean anything, the forecast is `null` with a
 *     stated reason. A number produced from two Tuesdays is not a forecast.
 *
 *   - **Sales are demand with a lid on it** (§II.2). This forecasts *sales*,
 *     because sales are what was recorded. It says so, and the service layer
 *     reports capacity and turned-away trade separately rather than quietly
 *     letting a capacity ceiling pass for a demand estimate.
 */

// Eight weeks is the source document's low end for learning a day-of-week
// shape; four is the floor below which this refuses outright. Between the two
// it forecasts and says the history is thin.
const MIN_TRADING_DAYS = 28;
const PREFERRED_TRADING_DAYS = 56;

// A weekday factor from two samples is noise wearing a number's clothes.
const MIN_SAMPLES_PER_WEEKDAY = 3;

/** Trailing window for the level. Long enough to be stable, short enough to move. */
const LEVEL_WINDOW_DAYS = 28;

/** Residuals older than this stop describing how the restaurant trades now. */
const RESIDUAL_WINDOW_DAYS = 56;

/** Below this many residuals, no interval is claimed. */
const MIN_RESIDUALS_FOR_BAND = 12;

/** Syntetos–Boylan–Croston cut-offs (§III.5), used to classify item series. */
const ADI_CUT = 1.32;
const CV2_CUT = 0.49;

const dayOfWeek = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function quantile(values, q) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/**
 * A day the restaurant did not trade at all.
 *
 * Deliberately requires *both* to be nil. A day with orders but no recorded
 * revenue is a data problem worth seeing, not a closure to be silently dropped.
 */
const isClosed = (d) => Number(d.orders) === 0 && Number(d.value) === 0;

/**
 * Syntetos–Boylan–Croston classification (§III.5).
 *
 * The point of this is what it protects against: averaging a dish that sells
 * three on a Saturday and none otherwise gives "0.6 a day", which is unprepped,
 * unorderable, wrong every single day, and wrong in the direction of stocking a
 * perishable that will not move.
 */
function classifySeries(values) {
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length < 2) {
    return { adi: null, cv2: null, klass: 'no signal', forecastable: false };
  }

  const adi = values.length / nonZero.length;
  const mean = nonZero.reduce((s, v) => s + v, 0) / nonZero.length;
  const variance = nonZero.reduce((s, v) => s + (v - mean) ** 2, 0) / nonZero.length;
  const cv2 = mean > 0 ? variance / mean ** 2 : null;

  const intermittent = adi >= ADI_CUT;
  const erratic = cv2 !== null && cv2 > CV2_CUT;

  const klass = intermittent
    ? (erratic ? 'lumpy' : 'intermittent')
    : (erratic ? 'erratic' : 'smooth');

  return {
    adi,
    cv2,
    klass,
    // Smooth and erratic series carry a share (§III.3). Intermittent and lumpy
    // ones are routed out — a share for them would be the 0.6-a-day mistake.
    forecastable: klass === 'smooth' || klass === 'erratic',
  };
}

/**
 * Weekday multipliers against the overall level, from trading days only.
 *
 * A weekday with too few samples gets `null` rather than a factor, and the
 * caller falls back to the flat level for that day and says it has done so.
 */
function weekdayFactors(trading) {
  const overall = median(trading.map((d) => d.value));
  const factors = new Array(7).fill(null);
  const samples = new Array(7).fill(0);

  for (let dow = 0; dow < 7; dow++) {
    const values = trading.filter((d) => dayOfWeek(d.date) === dow).map((d) => d.value);
    samples[dow] = values.length;
    if (values.length < MIN_SAMPLES_PER_WEEKDAY || !overall) continue;
    const m = median(values);
    factors[dow] = m === null ? null : m / overall;
  }
  return { factors, samples, overall };
}

/** The model's own point estimate for one date, given the history before it. */
function pointFor(history, targetDate) {
  const trading = history.filter((d) => !isClosed(d));
  if (trading.length < MIN_TRADING_DAYS) return null;

  const level = median(trading.slice(-LEVEL_WINDOW_DAYS).map((d) => d.value));
  if (level === null) return null;

  const { factors } = weekdayFactors(trading);
  const factor = factors[dayOfWeek(targetDate)];
  return factor === null ? level : level * factor;
}

/**
 * Rolling-origin backtest of this model against its own history (§VI.1).
 *
 * Every residual here was produced by re-fitting on only the days before the
 * one being scored, which is the only version of this figure that means
 * anything. Scoring a model on days it was fitted on is how a forecast comes to
 * look excellent and behave badly.
 */
function backtest(series) {
  const residuals = [];
  for (let i = MIN_TRADING_DAYS; i < series.length; i++) {
    const actualDay = series[i];
    if (isClosed(actualDay)) continue;             // nothing to score on a closed day
    const point = pointFor(series.slice(0, i), actualDay.date);
    if (point === null || !(point > 0)) continue;
    residuals.push({
      date: actualDay.date,
      dow: dayOfWeek(actualDay.date),
      ratio: actualDay.value / point,               // scale-free, so it pools
      absPctError: Math.abs(actualDay.value - point) / point,
    });
  }
  return residuals;
}

/**
 * Weighted MAPE, the operator-facing accuracy figure (§VI.3).
 *
 * Reported for the grain it was measured at and no other. The source document
 * is blunt about this: an outlet-level accuracy number quoted as if it were
 * item-level "becomes a churn conversation in month four".
 */
function weightedMape(residuals) {
  if (!residuals.length) return null;
  const sum = residuals.reduce((s, r) => s + r.absPctError, 0);
  return (sum / residuals.length) * 100;
}

/**
 * Forecast one date.
 *
 * Returns `point: null` with a `reason` whenever it cannot answer honestly. It
 * never returns a figure it does not believe.
 */
function forecastDay(series, targetDate, { residuals = null } = {}) {
  const closedDays = series.filter(isClosed).length;
  const trading = series.filter((d) => !isClosed(d));

  if (trading.length < MIN_TRADING_DAYS) {
    return {
      date: targetDate,
      point: null,
      lo: null,
      hi: null,
      reason: 'not_enough_history',
      tradingDays: trading.length,
      requiredDays: MIN_TRADING_DAYS,
      closedDaysExcluded: closedDays,
      basis: 'seasonal_naive',
    };
  }

  const { factors, samples, overall } = weekdayFactors(trading);
  const dow = dayOfWeek(targetDate);
  const level = median(trading.slice(-LEVEL_WINDOW_DAYS).map((d) => d.value));
  const factor = factors[dow];
  const point = factor === null ? level : level * factor;

  // Band from this model's realised errors on the same weekday, falling back to
  // all weekdays when one weekday alone has too few (§III.6). No residuals, no
  // band — an interval nobody measured is worse than none.
  const pool = residuals || backtest(series);
  const recent = pool.slice(-RESIDUAL_WINDOW_DAYS);
  const sameDow = recent.filter((r) => r.dow === dow);
  const used = sameDow.length >= MIN_RESIDUALS_FOR_BAND ? sameDow : recent;

  let lo = null;
  let hi = null;
  let bandBasis = 'none';
  if (used.length >= MIN_RESIDUALS_FOR_BAND) {
    lo = point * quantile(used.map((r) => r.ratio), 0.1);
    hi = point * quantile(used.map((r) => r.ratio), 0.9);
    bandBasis = used === sameDow ? 'same_weekday_residuals' : 'all_weekday_residuals';
  }

  return {
    date: targetDate,
    point,
    lo,
    hi,
    reason: null,
    basis: 'seasonal_naive',
    // Everything the screen needs to describe where the number came from.
    level,
    weekdayFactor: factor,
    weekdaySamples: samples[dow],
    weekdayIsFlat: factor === null,
    overallLevel: overall,
    tradingDays: trading.length,
    closedDaysExcluded: closedDays,
    historyIsThin: trading.length < PREFERRED_TRADING_DAYS,
    bandBasis,
    residualCount: used.length,
  };
}

module.exports = {
  forecastDay,
  backtest,
  weightedMape,
  classifySeries,
  weekdayFactors,
  median,
  quantile,
  isClosed,
  dayOfWeek,
  MIN_TRADING_DAYS,
  PREFERRED_TRADING_DAYS,
  MIN_SAMPLES_PER_WEEKDAY,
  MIN_RESIDUALS_FOR_BAND,
  LEVEL_WINDOW_DAYS,
  ADI_CUT,
  CV2_CUT,
};
