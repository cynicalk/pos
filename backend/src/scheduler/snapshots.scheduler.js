// Daily snapshot collection (MERGE_PLAN.md Phase 0).
//
// Not a strict per-timezone midnight cron. Like the waste-insights scheduler,
// this runs periodically and writes whatever is missing or still moving, which
// makes it idempotent, tz-agnostic and self-healing after downtime — a missed
// window costs nothing because the next pass fills the gap.
//
// The first pass backfills every past trading day that has orders. POS already
// holds real order history, so the forecasting clock does NOT start at zero the
// way it would have in the standalone ops app: it starts wherever the order
// data starts.

const snapshots = require('../snapshots/snapshots.service');

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 h

async function run() {
  try {
    const results = await snapshots.collectAll();
    const days = results.reduce((n, r) => n + r.days, 0);
    if (days > 0) {
      console.log(`[snapshots] wrote ${days} day(s) across ${results.length} restaurant(s)`);
    }
  } catch (err) {
    console.error('[snapshots]', err.message);
  }
}

function start() {
  // Delay the first pass so a large first-run backfill doesn't compete with
  // startup. Timers are unref'd so they never hold the process open.
  const kickoff = setTimeout(run, 30 * 1000);
  if (kickoff.unref) kickoff.unref();
  const timer = setInterval(run, CHECK_INTERVAL_MS);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { start, run };
