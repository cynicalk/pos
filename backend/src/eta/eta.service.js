/*
 * eta.service — the Phase-1 wait estimator.
 *
 * Turns the running stats (eta_avg_table_time, eta_category_stats — maintained
 * live by sessions.service) plus the current floor state into:
 *   - per-table "frees in ~N min" estimates, and
 *   - per-waiting-party queue waits (greedy table assignment).
 *
 * The math functions are pure and exported so they can be unit-tested without a
 * DB; the async composers at the bottom fetch state and apply them.
 *
 * Model (per the agreed design):
 *   weight_c   = blended seed -> learned (see eta.weights)
 *   remaining  = max(avgTableTime, sum of ordered category weights) - elapsed
 *   bill asked -> collapses to a short wrap-up
 *   no orders  -> falls back to avgTableTime ("calculating" while too early)
 *   + buffer for unknowns, floored so it never shows ~0.
 */
const repo = require('./eta.repository');
const settingsRepo = require('../settings/settings.repository');
const { blendedWeight, seedForCategory, BLEND_K, DEFAULT_AVG_TABLE_MINUTES } = require('./eta.weights');

const DEFAULT_BUFFER_MINUTES = 7;   // padding for mid-session ordering & unknowns
const WRAP_UP_MINUTES        = 5;   // remaining once the bill has been requested
const MIN_FLOOR_MINUTES      = 2;   // never present a table as "free in 0 min"
const CALCULATING_THRESHOLD  = 5;   // a just-seated, not-yet-ordered table is "calculating"

/* ── pure math ─────────────────────────────────────────────────────────────── */

// Restaurant-wide average table time, blended toward the global default until
// enough real sessions exist (mirrors the per-category blend).
function computeAvgTableTime(avgStat) {
  const n = avgStat?.n || 0;
  if (n <= 0) return DEFAULT_AVG_TABLE_MINUTES;
  const mean = avgStat.sum / n;
  return (n * mean + BLEND_K * DEFAULT_AVG_TABLE_MINUTES) / (n + BLEND_K);
}

// (category) -> minutes. Manual override wins; otherwise blended seed->learned.
function buildWeightFn(categoryStats, overrides) {
  return (category) => {
    if (overrides && overrides[category] != null && overrides[category] !== '') {
      const v = Number(overrides[category]);
      if (Number.isFinite(v) && v >= 0) return v;
    }
    return blendedWeight(category, categoryStats?.[category]);
  };
}

// Estimate how long until one occupied table frees, in minutes (incl. buffer).
function estimateTableFreeIn(table, { weightFn, avgTableTime, buffer, now = Date.now() }) {
  const start = table.started_at ? new Date(table.started_at).getTime() : null;
  const elapsed = start ? Math.max(0, (now - start) / 60000) : 0;
  const categories = table.categories || [];
  const hasOrders = categories.length > 0;

  let remaining;
  let basis;
  if (table.requested_bill_at) {
    remaining = WRAP_UP_MINUTES;
    basis = 'bill_requested';
  } else if (!hasOrders) {
    remaining = avgTableTime - elapsed;
    basis = 'avg_fallback';
  } else {
    const sumWeights = categories.reduce((s, c) => s + weightFn(c), 0);
    const expectedTotal = Math.max(avgTableTime, sumWeights);
    remaining = expectedTotal - elapsed;
    basis = 'category_weights';
  }

  remaining = Math.max(remaining, MIN_FLOOR_MINUTES);
  const calculating = !table.requested_bill_at && !hasOrders && elapsed < CALCULATING_THRESHOLD;

  return {
    tableId: table.table_id,
    number: table.number,
    seats: table.seats,
    freeInMinutes: Math.round(remaining + buffer),
    calculating,
    basis,
  };
}

// Greedy queue assignment. Parties are taken in priority order; each gets the
// candidate table that frees soonest and fits. A table reused by a later party
// is only free again after another turnover (+avgTableTime) — this is what makes
// the 3rd party in a 2-table room wait "first table's free-time + one turnover",
// and what lets whichever table frees first go to the head of the queue.
function assignQueue(candidateTables, parties, { avgTableTime, allowExtraChair = false } = {}) {
  const pool = candidateTables.map((t) => ({ ...t, nextFree: t.freeInMinutes }));
  const results = [];

  for (const party of parties) {
    const fits = (t) =>
      t.seats >= party.partySize ||
      (allowExtraChair && party.extraChair && t.seats >= party.partySize - 1);

    const candidates = pool.filter(fits);
    if (candidates.length === 0) {
      results.push({ partyId: party.partyId, tableId: null, waitMinutes: null });
      continue;
    }
    const pick = candidates.reduce((best, t) => (t.nextFree < best.nextFree ? t : best));
    results.push({ partyId: party.partyId, tableId: pick.tableId, waitMinutes: Math.round(pick.nextFree) });
    pick.nextFree += avgTableTime; // reused only after another full turnover
  }
  return results;
}

/* ── config / parsing ──────────────────────────────────────────────────────── */

function parseJson(value, fallback) {
  if (value == null) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function getConfig(restaurantId) {
  const s = await settingsRepo.getAll(restaurantId);
  const avgStat = parseJson(s.eta_avg_table_time, null);
  const categoryStats = parseJson(s.eta_category_stats, {});
  const overrides = parseJson(s.eta_category_overrides, {});
  const bufferRaw = parseFloat(s.eta_buffer_minutes);
  return {
    etaEnabled:               s.eta_enabled === 'true',
    allowExtraChair:          s.allow_extra_chair === 'true',
    reservationBlockEnabled:  s.eta_reservation_block_enabled !== 'false', // default ON
    buffer:                   Number.isFinite(bufferRaw) && bufferRaw >= 0 ? bufferRaw : DEFAULT_BUFFER_MINUTES,
    avgTableTime:             computeAvgTableTime(avgStat),
    avgSampleCount:           avgStat?.n || 0,
    categoryStats,
    overrides,
  };
}

// Effective per-category weights for the Settings UI: seed, learned avg, sample
// count, the blended value, any override, and the resulting effective weight.
function effectiveWeights(categoryStats, overrides) {
  const cats = new Set([...Object.keys(categoryStats || {}), ...Object.keys(overrides || {})]);
  const weightFn = buildWeightFn(categoryStats, overrides);
  return [...cats].sort().map((category) => {
    const stat = categoryStats?.[category];
    const n = stat?.n || 0;
    const overrideVal = overrides?.[category];
    return {
      category,
      seed: seedForCategory(category),
      samples: n,
      learnedAvg: n > 0 ? Math.round((stat.sum / n) * 10) / 10 : null,
      blended: Math.round(blendedWeight(category, stat) * 10) / 10,
      override: overrideVal != null && overrideVal !== '' ? Number(overrideVal) : null,
      effective: Math.round(weightFn(category) * 10) / 10,
    };
  });
}

/* ── async composers ───────────────────────────────────────────────────────── */

// Live estimate for every table: occupied tables get a "frees in" estimate,
// available tables are free now (0).
async function getTableEstimates(restaurantId) {
  const [config, occupied, available] = await Promise.all([
    getConfig(restaurantId),
    repo.getOccupiedTablesWithSession(restaurantId),
    repo.getAvailableTables(restaurantId),
  ]);
  const weightFn = buildWeightFn(config.categoryStats, config.overrides);
  const now = Date.now();

  const occupiedEstimates = occupied.map((t) =>
    estimateTableFreeIn(t, { weightFn, avgTableTime: config.avgTableTime, buffer: config.buffer, now }),
  );
  const availableEstimates = available.map((t) => ({
    tableId: t.table_id, number: t.number, seats: t.seats,
    freeInMinutes: 0, calculating: false, basis: 'available',
  }));

  return {
    avgTableTime: Math.round(config.avgTableTime),
    buffer: config.buffer,
    tables: [...availableEstimates, ...occupiedEstimates],
  };
}

// Which occupied/available tables a walk-in could actually be routed to, after
// removing tables held for an imminent reservation.
async function getCandidateTables(restaurantId, config, now = Date.now()) {
  const [occupied, available, reservations] = await Promise.all([
    repo.getOccupiedTablesWithSession(restaurantId),
    repo.getAvailableTables(restaurantId),
    config.reservationBlockEnabled ? repo.getUpcomingReservations(restaurantId) : Promise.resolve([]),
  ]);

  // A table is held if a reservation is due within one avg-table-time from now.
  const blocked = new Set();
  for (const r of reservations) {
    const dueInMin = (new Date(r.reserved_at).getTime() - now) / 60000;
    if (dueInMin <= config.avgTableTime) blocked.add(r.table_id);
  }

  const weightFn = buildWeightFn(config.categoryStats, config.overrides);
  const occ = occupied
    .filter((t) => !blocked.has(t.table_id))
    .map((t) => estimateTableFreeIn(t, { weightFn, avgTableTime: config.avgTableTime, buffer: config.buffer, now }));
  const avail = available
    .filter((t) => !blocked.has(t.table_id))
    .map((t) => ({ tableId: t.table_id, seats: t.seats, freeInMinutes: 0, calculating: false }));

  return [...avail, ...occ];
}

// Queue waits for a list of waiting parties (priority order). Used by the
// waitlist module once it exists; exposed here as the single estimator.
async function getQueueEstimate(restaurantId, parties) {
  const config = await getConfig(restaurantId);
  const candidates = await getCandidateTables(restaurantId, config);
  const assignments = assignQueue(candidates, parties, {
    avgTableTime: config.avgTableTime,
    allowExtraChair: config.allowExtraChair,
  });
  return { avgTableTime: Math.round(config.avgTableTime), assignments };
}

module.exports = {
  // pure (tested)
  computeAvgTableTime,
  buildWeightFn,
  estimateTableFreeIn,
  assignQueue,
  effectiveWeights,
  // async composers
  getConfig,
  getTableEstimates,
  getCandidateTables,
  getQueueEstimate,
  // constants (for callers/tests)
  DEFAULT_BUFFER_MINUTES,
};
