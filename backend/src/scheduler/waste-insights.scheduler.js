// Weekly AI waste-insight generation (AI Plan Phase 1A). Rather than a strict
// per-timezone Monday-08:00 cron, this periodically refreshes any restaurant
// that (a) logged waste in the last 28 days and (b) has no insight from the
// last 6 days — giving a ~weekly cadence that's idempotent and tz-agnostic.

const db = require('../shared/db');
const insights = require('../waste/waste-insights.service');

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 h
const STALE_DAYS = 6;

async function run() {
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT wl.restaurant_id AS id
       FROM waste_logs wl
       WHERE wl.logged_at >= NOW() - INTERVAL '28 days'
         AND NOT EXISTS (
           SELECT 1 FROM waste_insights wi
           WHERE wi.restaurant_id = wl.restaurant_id
             AND wi.created_at >= NOW() - make_interval(days => $1)
         )`,
      [STALE_DAYS],
    );
    for (const r of rows) {
      try {
        await insights.generate(r.id, 'cron');
      } catch (e) {
        console.error('[waste-insights-scheduler] generate failed for', r.id, '—', e.message);
      }
    }
  } catch (err) {
    console.error('[waste-insights-scheduler]', err.message);
  }
}

function start() {
  // Delay the first pass so startup isn't blocked by LLM/network calls.
  const kickoff = setTimeout(run, 60 * 1000);
  if (kickoff.unref) kickoff.unref();
  const timer = setInterval(run, CHECK_INTERVAL_MS);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { start };
