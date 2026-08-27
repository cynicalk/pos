// Review classification (MERGE_PLAN.md Phase 6).
//
// Runs slowly on purpose. getInsights classifies on demand before it
// aggregates, so an operator opening the Reviews page never waits on this
// timer — its whole job is the reviews nobody looked at, so that the rating_drop
// rule and Yumzy see a classified picture rather than a page-load-shaped one.
//
// Hourly rather than every few minutes because each pass may put a batch
// through the local model, and that competes for the same GPU the assistant is
// answering on.

const reputation = require('../reputation/reputation.service');

const INTERVAL_MS = 60 * 60 * 1000; // hourly

async function run() {
  try {
    const { restaurants, classified } = await reputation.classifyAll();
    if (classified > 0) {
      console.log(`[reputation] classified ${classified} review(s) across ${restaurants} restaurant(s)`);
    }
  } catch (err) {
    console.error('[reputation]', err.message);
  }
}

function start() {
  // Well after startup: the first pass may hit the model, and competing with
  // boot for it delays the things a user is actually waiting on.
  const kickoff = setTimeout(run, 3 * 60 * 1000);
  if (kickoff.unref) kickoff.unref();

  const timer = setInterval(run, INTERVAL_MS);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { start, run, INTERVAL_MS };
