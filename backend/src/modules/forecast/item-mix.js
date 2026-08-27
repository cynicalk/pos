/**
 * Level 2 of the hierarchy — item share (docs/FORECASTING.md §III.3).
 *
 * The document is explicit that you do **not** fit independent series per menu
 * item: "A 40-item menu gives 40 sparse, intermittent series and a per-item
 * model overfits every one." Instead the dense, learnable series is the outlet
 * total (baseline.js), and each dish takes a share of it.
 *
 * Shares are recency-weighted over a trailing window, adjusted for the weekday
 * being forecast, and normalised to one. Normalising is not tidiness — it is
 * what makes cannibalisation mechanical: a new paneer dish takes share from the
 * other paneer dishes rather than adding phantom volume on top of the total.
 *
 * The routing in §III.5 is enforced here. A dish that sells three on a Saturday
 * and none the rest of the week is *intermittent*, and averaging it to "0.6 a
 * day" produces a number that is unprepped, unorderable, wrong every day, and
 * wrong in the direction of stocking a perishable that will not move. Those
 * dishes are separated out and reported as what they are, with the day they
 * actually sell named, rather than being given a fractional share.
 */

const { classifySeries, median, dayOfWeek } = require('./baseline');

/**
 * Half-life for the recency weighting, in days.
 *
 * §III.3 asks for an exponentially weighted trailing share over four to eight
 * weeks. A three-week half-life puts roughly two thirds of the weight inside
 * the last month while still letting a full season inform the tail.
 */
const SHARE_HALF_LIFE_DAYS = 21;

/** Trailing window the shares are computed over. */
const SHARE_WINDOW_DAYS = 56;

/** Below this many trading days a dish has no share worth stating. */
const MIN_DAYS_FOR_SHARE = 14;

/**
 * A weekday tilt is only applied where a dish has enough of that weekday to
 * justify one. Otherwise the dish keeps its flat share.
 */
const MIN_WEEKDAY_SAMPLES = 3;

/** How far a single weekday may move a dish's share. */
const MAX_WEEKDAY_TILT = 2.5;

const weightFor = (ageDays) => 0.5 ** (ageDays / SHARE_HALF_LIFE_DAYS);

/**
 * Build per-item shares of the outlet total for a target date.
 *
 * @param days      [{ date, orders, value, items: { [name]: qty } }] oldest first,
 *                  closed days already removed by the caller.
 * @param targetDate `YYYY-MM-DD` being forecast.
 */
function buildShares(days, targetDate) {
  if (!days.length) {
    return { shares: [], irregular: [], covered: 0, tradingDays: 0 };
  }

  const window = days.slice(-SHARE_WINDOW_DAYS);
  const lastDate = window[window.length - 1].date;
  const lastMs = Date.parse(`${lastDate}T00:00:00Z`);
  const targetDow = dayOfWeek(targetDate);

  // Per-dish daily series across the window, zero-filled — a day a dish did not
  // sell is a real zero for that dish and is what makes it classifiable.
  const names = new Set();
  for (const d of window) for (const n of Object.keys(d.items || {})) names.add(n);

  const shares = [];
  const irregular = [];

  for (const name of names) {
    const series = window.map((d) => Number((d.items || {})[name] || 0));

    // Recency-weighted average quantity per trading day.
    let weighted = 0;
    let weight = 0;
    window.forEach((d, i) => {
      const age = (lastMs - Date.parse(`${d.date}T00:00:00Z`)) / 86400000;
      const w = weightFor(age);
      weighted += series[i] * w;
      weight += w;
    });
    const avgDaily = weight > 0 ? weighted / weight : 0;

    const shape = classifySeries(series);
    const soldOn = series.filter((v) => v > 0).length;

    if (!shape.forecastable || window.length < MIN_DAYS_FOR_SHARE) {
      // Routed out of the share entirely (§III.5). Reported with the weekday it
      // actually sells on, which is the useful half of the answer: "none today,
      // and you will likely need some on Saturday."
      const byDow = new Array(7).fill(0);
      window.forEach((d, i) => { byDow[dayOfWeek(d.date)] += series[i]; });
      const bestDow = byDow.indexOf(Math.max(...byDow));
      irregular.push({
        name,
        klass: shape.klass,
        adi: shape.adi,
        cv2: shape.cv2,
        soldOnDays: soldOn,
        ofDays: window.length,
        busiestWeekday: Math.max(...byDow) > 0 ? bestDow : null,
        sellsOnTargetDay: byDow[targetDow] > 0,
        typicalWhenItSells: median(series.filter((v) => v > 0)),
      });
      continue;
    }

    // Weekday tilt, only where the evidence supports one.
    const sameDow = window
      .map((d, i) => ({ dow: dayOfWeek(d.date), qty: series[i] }))
      .filter((x) => x.dow === targetDow);
    let tilt = 1;
    let tilted = false;
    if (sameDow.length >= MIN_WEEKDAY_SAMPLES && avgDaily > 0) {
      const dowMedian = median(sameDow.map((x) => x.qty));
      const allMedian = median(series);
      if (allMedian > 0 && dowMedian !== null) {
        tilt = Math.min(MAX_WEEKDAY_TILT, Math.max(1 / MAX_WEEKDAY_TILT, dowMedian / allMedian));
        tilted = true;
      }
    }

    shares.push({
      name,
      rawDaily: avgDaily * tilt,
      klass: shape.klass,
      soldOnDays: soldOn,
      ofDays: window.length,
      weekdayTilted: tilted,
    });
  }

  // Normalise to one across the forecastable dishes. `covered` is the share of
  // recent item volume this mix actually speaks for — the honest denominator,
  // and what stops the prep sheet reading as if it covered the whole menu.
  const total = shares.reduce((s, x) => s + x.rawDaily, 0);
  const irregularVolume = irregular.reduce(
    (s, x) => s + (x.typicalWhenItSells || 0) * x.soldOnDays, 0,
  );
  const shareVolume = shares.reduce((s, x) => s + x.rawDaily * window.length, 0);

  return {
    shares: shares
      .map((x) => ({ ...x, share: total > 0 ? x.rawDaily / total : 0 }))
      .sort((a, b) => b.share - a.share),
    irregular: irregular.sort((a, b) => b.soldOnDays - a.soldOnDays),
    covered: shareVolume + irregularVolume > 0
      ? shareVolume / (shareVolume + irregularVolume)
      : 0,
    tradingDays: window.length,
  };
}

/**
 * Turn the outlet-total forecast into per-dish quantities.
 *
 * The band travels with each dish rather than being recomputed: the uncertainty
 * lives in the total, and a share applied to a wider total is simply wider.
 */
function itemForecast(totalForecast, mix) {
  if (!totalForecast || totalForecast.point === null) return [];

  // The shares normalise to one across the *forecastable* dishes only, so they
  // must be applied to the volume those dishes actually account for — not to
  // the whole day. Handing the smooth dishes the intermittent ones' portions
  // too would over-prep every dish on the sheet by however much volume was
  // routed out, silently and in the direction of waste.
  const claimable = mix.covered ?? 1;

  return mix.shares.map((s) => ({
    name: s.name,
    share: s.share,
    qty: totalForecast.point * claimable * s.share,
    lo: totalForecast.lo === null ? null : totalForecast.lo * claimable * s.share,
    hi: totalForecast.hi === null ? null : totalForecast.hi * claimable * s.share,
    klass: s.klass,
    soldOnDays: s.soldOnDays,
    ofDays: s.ofDays,
    weekdayTilted: s.weekdayTilted,
  }));
}

module.exports = {
  buildShares,
  itemForecast,
  SHARE_HALF_LIFE_DAYS,
  SHARE_WINDOW_DAYS,
  MIN_DAYS_FOR_SHARE,
  MIN_WEEKDAY_SAMPLES,
};
