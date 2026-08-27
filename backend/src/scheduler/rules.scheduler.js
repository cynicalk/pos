// Rules evaluation + outcome measurement (MERGE_PLAN.md Phase 2).
//
// Runs more often than the other schedulers because one of its rules is about
// something happening right now: a table seated without ordering is only worth
// alerting on while the party is still there. Fifteen minutes keeps that useful
// without turning a 25-minute threshold into a stream of near-duplicate alerts —
// dedupe is keyed per occupancy, so a stalled table raises exactly one action
// however many passes see it.
//
// Outcome measurement is much slower-moving and runs on its own longer timer.

const actions = require('../actions/actions.service');

const EVALUATE_INTERVAL_MS = 15 * 60 * 1000;      // every 15 min
const MEASURE_INTERVAL_MS  = 6 * 60 * 60 * 1000;  // every 6 h

async function runEvaluate() {
  try {
    const { restaurants, created } = await actions.evaluateAll();
    if (created > 0) {
      console.log(`[rules] raised ${created} action(s) across ${restaurants} restaurant(s)`);
    }
  } catch (err) {
    console.error('[rules]', err.message);
  }
}

async function runMeasure() {
  try {
    const measured = await actions.measureDueOutcomes();
    if (measured > 0) console.log(`[outcomes] measured ${measured} outcome(s)`);
  } catch (err) {
    console.error('[outcomes]', err.message);
  }
}

function start() {
  // Delayed first pass so startup isn't competing with a full evaluation.
  const kickoff = setTimeout(runEvaluate, 45 * 1000);
  if (kickoff.unref) kickoff.unref();

  const evalTimer = setInterval(runEvaluate, EVALUATE_INTERVAL_MS);
  if (evalTimer.unref) evalTimer.unref();

  const measureTimer = setInterval(runMeasure, MEASURE_INTERVAL_MS);
  if (measureTimer.unref) measureTimer.unref();

  return { evalTimer, measureTimer };
}

module.exports = { start, runEvaluate, runMeasure };
