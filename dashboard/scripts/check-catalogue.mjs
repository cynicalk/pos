/**
 * Guard for the feature catalogue (shared/catalogue.js) — W1 of the plan.
 *
 * The catalogue is the one place the deck's 86 features, the archived project's
 * status, and the current POS reality are reconciled. Its whole value is that a
 * reader can trust it, so this guard fails the build if it drifts:
 *
 *   1. The totals are pinned. 77-vs-86 was a real inconsistency; the count is
 *      now derivable, and a feature appearing or vanishing shows in a diff.
 *   2. Every status is from the known vocabulary — no free-text status.
 *   3. Every re-keying carries a note. A status that disagrees with the archived
 *      registry (built -> absent, history-gated -> built) without a stated reason
 *      is exactly the silent claim this file exists to prevent.
 *   4. The shell subset agrees, one-for-one, with plannedFeatures.js — so the
 *      catalogue and the screens the operator actually sees cannot say different
 *      things about which features are still empty.
 *
 * Run with `npm run check:catalogue`.
 */
import { CATALOGUE, FAMILIES, TIERS, byStatus } from '../../shared/catalogue.js';
import { PLANNED_FEATURES } from '../src/lib/plannedFeatures.js';

// Pinned deliberately. Raising any of these is a decision someone made, visible
// in the diff — not a silent side effect of editing the generator.
const EXPECTED_TOTAL = 86;
const EXPECTED_BY_STATUS = {
  built: 53,
  partial: 9,
  shell: 8,
  absent: 9,
  external: 4,
  'blocked-ext': 3,
};

const STATUSES = new Set(Object.keys(EXPECTED_BY_STATUS));
const TIER_KEYS = new Set(Object.keys(TIERS));
const errors = [];

if (CATALOGUE.length !== EXPECTED_TOTAL) {
  errors.push(
    `Expected ${EXPECTED_TOTAL} features, found ${CATALOGUE.length}. ` +
    'If this is intended, update EXPECTED_TOTAL and the deck’s count together.',
  );
}

for (const [status, expected] of Object.entries(EXPECTED_BY_STATUS)) {
  const actual = byStatus(status).length;
  if (actual !== expected) {
    errors.push(`Expected ${expected} feature(s) with status "${status}", found ${actual}.`);
  }
}

const seenSlugs = new Set();
for (const f of CATALOGUE) {
  const id = f.slug || '(missing slug)';

  for (const field of ['slug', 'name', 'family', 'phase', 'tier', 'status']) {
    if (f[field] === undefined || f[field] === null || f[field] === '') {
      errors.push(`${id}: missing required field "${field}".`);
    }
  }
  if (seenSlugs.has(f.slug)) errors.push(`${id}: duplicate slug.`);
  seenSlugs.add(f.slug);

  if (!STATUSES.has(f.status)) errors.push(`${id}: unknown status "${f.status}".`);
  if (!FAMILIES.includes(f.family)) errors.push(`${id}: unknown family "${f.family}".`);
  if (!TIER_KEYS.has(f.tier)) errors.push(`${id}: unknown tier "${f.tier}".`);
  if (![1, 2, 3].includes(f.phase)) errors.push(`${id}: phase must be 1, 2 or 3.`);

  // A re-keying without a reason is the thing this file exists to prevent.
  if (f.archivedStatus && f.status !== mapArchived(f.archivedStatus) && !f.note) {
    errors.push(`${id}: status "${f.status}" differs from archived "${f.archivedStatus}" but carries no note.`);
  }
}

// The shell subset must be the same set of screens plannedFeatures.js renders.
const catalogueShellSlugs = new Set(byStatus('shell').map((f) => f.shellSlug));
const plannedSlugs = new Set(PLANNED_FEATURES.map((f) => f.slug));

for (const f of byStatus('shell')) {
  if (!f.shellSlug) errors.push(`${f.slug}: status is "shell" but has no shellSlug bridge.`);
  else if (!plannedSlugs.has(f.shellSlug)) {
    errors.push(`${f.slug}: shellSlug "${f.shellSlug}" has no matching entry in plannedFeatures.js.`);
  }
}
for (const p of PLANNED_FEATURES) {
  if (!catalogueShellSlugs.has(p.slug)) {
    errors.push(
      `plannedFeatures.js "${p.slug}" is not referenced by any catalogue shell. ` +
      'Either it became buildable (mark it built in the catalogue and swap its route) ' +
      'or the catalogue is missing it.',
    );
  }
}

function mapArchived(s) {
  return { built: 'built', partial: 'partial', blocked: 'shell', 'history-gated': 'shell' }[s] || 'absent';
}

if (errors.length) {
  console.error(`\ncheck:catalogue FAILED — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error('');
  process.exit(1);
}

console.log(
  `check:catalogue OK — ${CATALOGUE.length} features across ${FAMILIES.length} families, ` +
  `${EXPECTED_BY_STATUS.built} built, and the ${EXPECTED_BY_STATUS.shell} shells agree with plannedFeatures.js.`,
);
