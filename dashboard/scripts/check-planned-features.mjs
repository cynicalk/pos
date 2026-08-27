/**
 * Guard for the Tier-3 shells (MERGE_PLAN.md §3 and §6, "shell rot").
 *
 * The realistic failure mode for these screens is not that they break — it is
 * that during some demo push somebody adds a plausible-looking figure to one
 * ("about ₹40,000 a month recovered"), it never gets removed, and a page whose
 * entire purpose is to say "we do not know this yet" quietly starts asserting
 * something. A reader cannot tell an illustrative number from a measured one.
 *
 * So: no digits in any operator-facing string in EITHER registry — the reasons
 * in plannedFeatures.js and the screen layouts in featureLayouts.js. Since the
 * shells now render their real filters, figures, axes and columns, a column
 * header or a KPI label is operator-facing copy too, and is exactly where an
 * illustrative figure would go unnoticed. The single place a real figure may
 * appear on these screens is the history meter, which reads measured values
 * from /api/snapshots/coverage at runtime.
 *
 * The other guard here: every feature must HAVE a layout. A shell that quietly
 * falls back to the prose-only <Unavailable> is a screen somebody forgot.
 *
 * Run with `npm run check:planned`. No dependencies by design.
 */
import { PLANNED_FEATURES, REASON } from '../src/lib/plannedFeatures.js';
import { findFeatureLayout } from '../src/lib/featureLayouts.js';

// Pinned deliberately. Raising these numbers should be a decision someone made,
// not a green tick after a shell quietly appeared — the whole point of the
// guard is that a feature moving between "shipped" and "shelled" is visible in
// a diff.
// 2026-08-27: Demand Forecast and Prep Sheet left this registry when the
// 56-day history gate was cleared and Tier 0 shipped. Their routes did not
// move — settling the URLs while they were shells was the point.
const EXPECTED_TOTAL = 17;
const EXPECTED_BY_REASON = {
  [REASON.COLLECTING]: 7,            // nine, less demand and prep-sheet
  [REASON.NEEDS_INFRASTRUCTURE]: 4,  // aggregator scraping
  [REASON.NEEDS_HARDWARE]: 4,        // cameras + CV
  [REASON.NEEDS_CREDENTIALS]: 1,     // Tally
  [REASON.NEEDS_UPLOAD]: 1,          // Phase 7: nutrition data the POS does not hold
};

const PROSE_FIELDS = ['title', 'summary', 'blocker'];
const errors = [];

/** Every string anywhere in a layout, with a path so a failure names itself. */
function* walk(node, path) {
  if (typeof node === 'string') {
    yield [path, node];
  } else if (Array.isArray(node)) {
    for (const [i, v] of node.entries()) yield* walk(v, `${path}[${i}]`);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) yield* walk(v, `${path}.${k}`);
  }
}

if (PLANNED_FEATURES.length !== EXPECTED_TOTAL) {
  errors.push(
    `Expected ${EXPECTED_TOTAL} planned features, found ${PLANNED_FEATURES.length}. ` +
    'If a feature became buildable, remove it here AND swap its route element — ' +
    'do not leave a shell on a route that now has a real page.',
  );
}

for (const [reason, expected] of Object.entries(EXPECTED_BY_REASON)) {
  const actual = PLANNED_FEATURES.filter((f) => f.reason === reason).length;
  if (actual !== expected) {
    errors.push(`Expected ${expected} feature(s) with reason "${reason}", found ${actual}.`);
  }
}

const seenSlugs = new Set();
const seenPaths = new Set();

for (const f of PLANNED_FEATURES) {
  const id = f.slug || '(missing slug)';

  for (const field of ['slug', 'path', 'title', 'group', 'summary', 'reason', 'blocker']) {
    if (!f[field]) errors.push(`${id}: missing required field "${field}".`);
  }

  if (seenSlugs.has(f.slug)) errors.push(`${id}: duplicate slug.`);
  if (seenPaths.has(f.path)) errors.push(`${id}: duplicate path "${f.path}".`);
  seenSlugs.add(f.slug);
  seenPaths.add(f.path);

  if (f.path && !f.path.startsWith('/')) {
    errors.push(`${id}: path must be absolute so the route matches the nav link.`);
  }

  // The guard that matters.
  for (const field of PROSE_FIELDS) {
    const value = f[field];
    if (typeof value === 'string' && /\d/.test(value)) {
      errors.push(
        `${id}: "${field}" contains a digit — these screens must never show a figure. ` +
        `Offending text: ${JSON.stringify(value.slice(0, 90))}`,
      );
    }
  }

  if (f.alternative && /\d/.test(f.alternative.label || '')) {
    errors.push(`${id}: "alternative.label" contains a digit.`);
  }

  // Every shell renders a screen, and every string in that screen is copy.
  const layout = findFeatureLayout(f.slug);
  if (!layout) {
    errors.push(
      `${id}: no entry in featureLayouts.js. Every shell renders the real screen with ` +
      'nothing in it — a feature without a layout falls back to prose and looks abandoned.',
    );
  } else {
    for (const [path, value] of walk(layout, `${id}.layout`)) {
      if (/\d/.test(value)) {
        errors.push(
          `${path} contains a digit — these screens must never show a figure. ` +
          `Offending text: ${JSON.stringify(value.slice(0, 90))}`,
        );
      }
    }
    if (!layout.table && !layout.kpis && !layout.status) {
      errors.push(`${id}: layout has no figures, table or status — there is no screen to show.`);
    }
  }
}

if (errors.length) {
  console.error(`\ncheck:planned FAILED — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error('');
  process.exit(1);
}

console.log(
  `check:planned OK — ${PLANNED_FEATURES.length} shells, each rendering a real screen, ` +
  'no invented figures, counts match the source docs.',
);
