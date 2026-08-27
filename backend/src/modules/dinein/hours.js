/**
 * Peak & Dead Hour Detection — ported from `src/modules/dinein/hours.ts`.
 *
 * Two changes on the way across, both forced by real data:
 *
 * 1. **Timezone.** The source hardcoded a +5:30 offset and bucketed in
 *    JavaScript, because its timestamps were UTC and it had one market. POS
 *    stores a per-restaurant timezone and buckets everything else with
 *    `AT TIME ZONE`, so the bucketing moved into SQL and this module only
 *    shapes the result — correct in any timezone, and correct across DST, which
 *    a fixed offset is not.
 *
 * 2. **The service window wraps midnight.** The source defined the window as
 *    the first to the last hour that ever saw an order, and called the silent
 *    hours inside it "dead". That breaks for any restaurant trading past
 *    midnight: with orders at 1 am and at 11 pm the window becomes the entire
 *    clock, and the nine morning hours the kitchen is shut get reported as
 *    underperformance. Observed on real data — a 1 pm–3 am service showed nine
 *    "dead" hours, every one of them simply closed.
 *
 *    Instead the longest unbroken stretch of zero-order hours is treated as
 *    closed, measured circularly so it may span midnight. The service window is
 *    everything else, and dead hours are the silent hours genuinely inside it.
 *    This matches what the source said it wanted — "closed hours outside it
 *    don't count" — rather than what its arithmetic did.
 */

function hourLabel(hour) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'am' : 'pm'}`;
}

/**
 * The longest circular run of hours with no orders — the closed stretch.
 * Returns null when the restaurant traded in every hour of the day.
 */
function longestClosedRun(orderedHours) {
  const silent = orderedHours.map((h) => h === 0);
  if (silent.every((s) => !s)) return null;

  let best = { start: -1, length: 0 };
  // Scan twice around the clock so a run crossing midnight is seen whole.
  let runStart = -1;
  let runLength = 0;
  for (let i = 0; i < 48; i += 1) {
    if (silent[i % 24]) {
      if (runLength === 0) runStart = i % 24;
      runLength += 1;
      if (runLength > best.length && runLength <= 24) {
        best = { start: runStart, length: runLength };
      }
    } else {
      runLength = 0;
    }
  }
  return best.length > 0 ? best : null;
}

/**
 * @param rows  [{ hour, orders, revenue }] — hours with at least one order,
 *              already bucketed in the restaurant's local timezone
 * @param daysObserved  distinct trading days behind those rows
 */
function buildServiceHours(rows, daysObserved = 0) {
  const orders = new Array(24).fill(0);
  const revenue = new Array(24).fill(0);
  let totalOrders = 0;
  let anyOrders = false;

  for (const r of rows) {
    const hour = Number(r.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    orders[hour] = Number(r.orders || 0);
    revenue[hour] = Number(r.revenue || 0);
    totalOrders += orders[hour];
    if (orders[hour] > 0) anyOrders = true;
  }

  if (!anyOrders) {
    return {
      buckets: [], peakHours: [], deadHours: [],
      totalOrders: 0, daysObserved: 0, closedHours: [],
    };
  }

  const closed = longestClosedRun(orders);
  const closedHours = [];
  if (closed) {
    for (let i = 0; i < closed.length; i += 1) closedHours.push((closed.start + i) % 24);
  }

  // The window opens the hour the closed stretch ends and runs until it begins
  // again, so an overnight service reads as one continuous shift.
  const windowLength = 24 - closedHours.length;
  const windowStart = closed ? (closed.start + closed.length) % 24 : 0;

  const buckets = [];
  for (let i = 0; i < windowLength; i += 1) {
    const hour = (windowStart + i) % 24;
    buckets.push({ hour, label: hourLabel(hour), orders: orders[hour], revenue: revenue[hour] });
  }

  const maxOrders = Math.max(...buckets.map((b) => b.orders));
  return {
    buckets,
    peakHours: buckets.filter((b) => b.orders === maxOrders && b.orders > 0).map((b) => b.hour),
    deadHours: buckets.filter((b) => b.orders === 0).map((b) => b.hour),
    closedHours,
    totalOrders,
    daysObserved: Number(daysObserved || 0),
  };
}

module.exports = { hourLabel, longestClosedRun, buildServiceHours };
