/*
 * Narration eval harness — scores every AI-narrated surface against the same
 * discipline the strict prompts ask for, whether the sentence came from the model
 * or the honest fallback.
 *
 * For each surface (daily brief, weekly review, evening wrap, review analysis,
 * action plan) it produces the real narrative against the demo DB and grades it:
 *   - fidelity  : every rupee amount / percentage traces to a signal number
 *                 (the numeric-fidelity guard, applied as a score)
 *   - length    : a short spoken read, not a wall of text
 *   - no-hype   : no value-judgement words the prompts forbid
 *   - source    : model or fallback
 *
 * Run it to see the AI layer's quality at a glance; it exits non-zero if any
 * surface fails fidelity, so it can gate a release. When the model is offline
 * every surface is graded on its fallback, which must still pass.
 *
 * Usage: node scripts/eval-narration.js [restaurantId]
 */
require('dotenv').config();
const db = require('../src/shared/db');
const { figuresGrounded, numbersFromSignals } = require('../src/ai/narrate');

const brief = require('../src/ai/brief.service');
const weekly = require('../src/ai/weekly-review.service');
const wrap = require('../src/ai/evening-wrap.service');
const reputation = require('../src/reputation/reputation.service');
const actions = require('../src/actions/actions.service');

const HYPE = /\b(good|bad|great|poor|excellent|terrible|amazing|awful|impressive|worrying)\b/i;
const wordCount = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length;

async function main() {
  const restaurantId = process.argv[2] || (await db.query(
    `SELECT id FROM restaurants WHERE name = 'Demo Restaurant' LIMIT 1`,
  )).rows[0]?.id;
  if (!restaurantId) throw new Error('No restaurant id given and no "Demo Restaurant" found');

  // Each surface returns { signals, narrative, aiUsed }.
  const surfaces = [
    ['Daily brief',     () => brief.getDailyBrief(restaurantId)],
    ['Weekly review',   () => weekly.getWeeklyReview(restaurantId)],
    ['Evening wrap',    () => wrap.getEveningWrap(restaurantId)],
    ['Review analysis', () => reputation.getReviewAnalysis(restaurantId)],
    ['Action plan',     () => actions.getActionBrief(restaurantId)],
  ];

  const rows = [];
  let anyFail = false;
  for (const [name, run] of surfaces) {
    let r;
    try { r = await run(); } catch (e) { rows.push({ name, error: e.message }); anyFail = true; continue; }
    const text = r.narrative || '';
    const allowed = numbersFromSignals(r.signals || {});
    const fidelity = figuresGrounded(text, allowed);
    const words = wordCount(text);
    const lengthOk = words >= 5 && words <= 160;
    const noHype = !HYPE.test(text);
    if (!fidelity) anyFail = true;
    rows.push({
      name,
      source: r.aiUsed ? 'model' : 'fallback',
      fidelity: fidelity ? 'PASS' : 'FAIL',
      words,
      lengthOk: lengthOk ? 'ok' : 'off',
      noHype: noHype ? 'ok' : 'hype',
    });
  }

  console.log('\nNarration eval — CookLyt AI surfaces\n');
  for (const r of rows) {
    if (r.error) { console.log(`  ${r.name.padEnd(16)} ERROR: ${r.error}`); continue; }
    console.log(
      `  ${r.name.padEnd(16)} ${r.source.padEnd(9)} fidelity:${r.fidelity.padEnd(5)} ` +
      `words:${String(r.words).padStart(3)} (${r.lengthOk})  hype:${r.noHype}`,
    );
  }
  console.log(anyFail ? '\nFAIL — a surface did not pass fidelity.\n' : '\nAll surfaces pass fidelity.\n');
  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
