/**
 * Promo detection for the forecast — which historical days were distorted by a
 * promotion, so the baseline can set them aside.
 *
 * The signal is coupon redemptions the POS already records: a day where a
 * material share of orders carried a discount was not a normal trading day, and
 * letting it into the level would teach every future same-weekday a spike that
 * only happens when there is an offer on. This decides the flag; baseline.js
 * does the excluding, and the service reports it. Nothing here forecasts a promo
 * *uplift* — that needs the promo's own terms and history this deployment does
 * not hold, and a made-up uplift is exactly the kind of number the engine won't
 * print.
 *
 * A day needs BOTH a floor count and a share to count as promo: a couple of
 * coupons on a busy day is ordinary loyalty, not a promotion, and the share is
 * what separates the two.
 */

const MIN_REDEMPTIONS = 3;   // fewer than this is ordinary coupon use, not a promo
const MIN_SHARE = 0.15;      // and it has to be a real slice of the day's orders

/**
 * Decide which days are promo days.
 *
 * @param days [{ date, orders }]  — the trading days with their order counts
 * @param redemptionsByDate  { 'YYYY-MM-DD': redemptionCount }
 * @returns { promoDates: Set, detail: [{ date, redemptions, orders, share }] }
 */
function detectPromoDays(days, redemptionsByDate = {}, opts = {}) {
  const minRedemptions = opts.minRedemptions ?? MIN_REDEMPTIONS;
  const minShare = opts.minShare ?? MIN_SHARE;

  const detail = [];
  const promoDates = new Set();
  for (const day of days) {
    const redemptions = Number(redemptionsByDate[day.date] || 0);
    const orders = Number(day.orders) || 0;
    if (redemptions < minRedemptions) continue;
    const share = orders > 0 ? redemptions / orders : 0;
    if (share < minShare) continue;
    promoDates.add(day.date);
    detail.push({ date: day.date, redemptions, orders, share: Math.round(share * 1000) / 1000 });
  }
  return { promoDates, detail };
}

/**
 * Return a copy of the series with `promo: true` set on the detected days.
 *
 * A new array of shallow-copied points, so the caller's series is untouched and
 * baseline.js sees the flag without anything else changing.
 */
function flagPromoDays(series, promoDates) {
  return series.map((d) => (promoDates.has(d.date) ? { ...d, promo: true } : d));
}

module.exports = { detectPromoDays, flagPromoDays, MIN_REDEMPTIONS, MIN_SHARE };
