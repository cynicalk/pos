# `src/modules` — ported ops-back-office logic

Landing zone for logic ported from the Next.js ops back-office
(`C:\Opencode-project\cooklyt/src/modules`) during the merge. See
`MERGE_PLAN.md` at the repo root.

## What belongs here

**Pure computation only.** Rule evaluation, economics arithmetic, opportunity
scoring, turnover and wait estimation, SOP drift detection. A module takes plain
data in and returns plain data out.

**No database access.** Nothing here requires `shared/db`. Data is fetched by the
owning feature's `*.repository.js` and passed in. This is what makes these
functions testable without a database, and it is the property that made them
worth porting in the first place.

## Why the split matters

Measured before the port: **11 of 56** files in the source `modules/` directory
are already db-free; the other 45 carry Prisma queries. Those 45 do not move
here as-is — their queries become POS repository methods under the owning
feature directory (`Router → Service → Repository → SQL`), and only the
computation left over lands here.

**Prisma must not be added to this backend.** Two data-access layers in one
service is the outcome the merge exists to prevent.

## Tests

Each ported module brings its vitest file across as a jest test **in the same
commit as the logic**. The source repo has 27 of them, and they are the only
thing making a 45-file query rewrite verifiable. A module ported without its
test is a module nobody can check.

Tests live alongside the rest of the suite in `backend/tests/` and run under the
existing `npm test`.

## Conversion notes

- `.ts` → `.js`: drop type annotations and interfaces; keep the doc comments,
  which carry the reasoning behind the thresholds and guards.
- `export function` → `module.exports = { ... }` at the file foot.
- `Decimal` / `Prisma.Decimal` values arrive from `pg` as strings. Wrap in
  `Number()` at the repository boundary, not scattered through the logic.
- Keep the honest-fallback behaviour intact. Where the source returns `null`,
  "not on file", or a stated-default rather than a computed number, that is
  deliberate — it is the difference between an unknown and an invented zero.
