/**
 * New Item Performance Tracker — ported from `src/modules/menu/new-items.ts`.
 *
 * A dish added last Tuesday cannot fairly be compared against a month of
 * history, so each new item is measured on its own days-live and set against
 * the menu's median daily volume per dish.
 *
 * Dishes with no recorded launch date are not tracked at all. POS only started
 * stamping `menu_items.created_at` in migration 075, so the existing menu has
 * no honest launch date — see that migration for why backfilling one would have
 * shown the operator's whole established menu as freshly launched.
 */

const NEW_ITEM_WINDOW_DAYS = 30;

// A dish needs a few days of service before its rate means anything. Below
// this, one busy evening or one quiet one swings the verdict entirely.
const MIN_DAYS_FOR_VERDICT = 3;
const OUTPERFORMING_RATIO = 1.25;
const SLOW_START_RATIO = 0.5;

function verdictFor(daysLive, avgDaily, menuMedianDaily) {
  if (daysLive < MIN_DAYS_FOR_VERDICT) return 'too early';
  // With no median to compare against there is no basis for a verdict — say so
  // rather than defaulting to "on pace", which reads as a measured judgement.
  if (!(menuMedianDaily > 0)) return 'no comparison yet';
  if (avgDaily >= menuMedianDaily * OUTPERFORMING_RATIO) return 'outperforming';
  if (avgDaily < menuMedianDaily * SLOW_START_RATIO) return 'slow start';
  return 'on pace';
}

/**
 * @param newItems         rows of { id, name, category, created_at, sold, revenue }
 *                         where sold/revenue count only lines since created_at
 * @param menuMedianDaily  median daily orders per dish across the whole menu
 */
function buildNewItemPerformance(newItems, menuMedianDaily, now = Date.now()) {
  return newItems
    .filter((item) => item.created_at)
    .map((item) => {
      const launchedAt = new Date(item.created_at);
      const daysLive = Math.max(
        1, Math.ceil((now - launchedAt.getTime()) / 86400000),
      );
      const ordersSinceLaunch = Number(item.sold || 0);
      const avgDailyOrders = ordersSinceLaunch / daysLive;

      return {
        id: item.id,
        name: item.name,
        category: item.category,
        launchedAt: launchedAt.toISOString(),
        daysLive,
        ordersSinceLaunch,
        revenueSinceLaunch: Number(item.revenue || 0),
        avgDailyOrders,
        menuMedianDaily,
        verdict: verdictFor(daysLive, avgDailyOrders, menuMedianDaily),
      };
    })
    .sort((a, b) => new Date(b.launchedAt) - new Date(a.launchedAt));
}

/** Median daily orders per dish, from per-item totals over an observed span. */
function medianDailyRate(perItemQuantities, spanDays) {
  if (!perItemQuantities.length || spanDays <= 0) return 0;
  const rates = perItemQuantities
    .map((q) => Number(q) / spanDays)
    .sort((a, b) => a - b);
  return rates[Math.floor(rates.length / 2)];
}

module.exports = {
  NEW_ITEM_WINDOW_DAYS, MIN_DAYS_FOR_VERDICT,
  OUTPERFORMING_RATIO, SLOW_START_RATIO,
  verdictFor, buildNewItemPerformance, medianDailyRate,
};
