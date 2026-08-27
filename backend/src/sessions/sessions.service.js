/*
 * sessions.service — records a finished dining session and folds it into the
 * ETA running stats.
 *
 * recordSessionEnd() is the single sink for "a table just freed", called from
 * the tables.service occupied -> available chokepoint. It is FIRE-AND-FORGET:
 * callers invoke it with .catch() and never await it in a critical path, so a
 * failure here can never affect a payment, cancellation, or manual table update.
 *
 * What it persists (table_sessions) feeds the Phase-2 ML model later; what it
 * updates (eta_avg_table_time + eta_category_stats in settings) drives the
 * Phase-1 blended estimate live.
 */
const db = require('../shared/db');
const repo = require('./sessions.repository');
const { seedForCategory } = require('../eta/eta.weights');

async function recordSessionEnd(tableId, restaurantId) {
  if (!tableId || !restaurantId) return null;

  return db.withTransaction(async (client) => {
    const ending = await repo.getEndingSession(client, tableId, restaurantId);
    if (!ending) return null; // no orders, or already logged

    const cats = await repo.getSessionCategories(client, ending.session_id, restaurantId);
    if (cats.length === 0) return null; // only cancelled items — nothing real happened

    const categoriesOrdered = {};
    let itemCount = 0;
    let totalAmount = 0;
    for (const row of cats) {
      const cat = row.category || 'Uncategorized';
      categoriesOrdered[cat] = (categoriesOrdered[cat] || 0) + row.qty;
      itemCount += row.qty;
      totalAmount += parseFloat(row.amount || 0);
    }

    const [hadReservation, party] = await Promise.all([
      repo.hadReservation(client, tableId, restaurantId, ending.started_at),
      repo.getSeatedPartyForTable(client, tableId, ending.started_at),
    ]);

    const inserted = await repo.insertSession(client, {
      restaurantId,
      tableId,
      sessionId: ending.session_id,
      waitlistId: party?.id ?? null,    // back-link to the seated walk-in party, if any
      partySize: party?.party_size ?? null, // key Phase-2 signal when the party came via the waitlist
      startedAt: ending.started_at,
      hadReservation,
      requestedBillAt: ending.requested_bill_at,
      categoriesOrdered,
      itemCount,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      // A logged session always has non-cancelled items, so it was either paid
      // or freed manually while still unpaid (served, comped, walkout, etc.).
      endedReason: ending.any_paid ? 'paid' : 'manual',
    });
    if (!inserted) return null; // lost an idempotency race — don't double-count stats

    await updateEtaStats(client, restaurantId, inserted, Object.keys(categoriesOrdered));
    return inserted;
  });
}

// Folds one finished session into the running aggregates. Stat rows are locked
// (lockStat uses FOR UPDATE) in a fixed order — avg first, then categories — so
// concurrent session-ends serialise without deadlocking.
async function updateEtaStats(client, restaurantId, session, categories) {
  const duration = parseFloat(session.duration_minutes);
  if (!Number.isFinite(duration) || duration <= 0) return;

  // Restaurant-wide average table time: running { n, sum }.
  const avg = (await repo.lockStat(client, restaurantId, 'eta_avg_table_time')) || { n: 0, sum: 0 };
  avg.n = (avg.n || 0) + 1;
  avg.sum = (avg.sum || 0) + duration;
  await repo.upsertStat(client, restaurantId, 'eta_avg_table_time', JSON.stringify(avg));

  // Per-category learned weights: attribute this session's duration across the
  // categories it contained, proportional to each category's seed weight.
  const stats = (await repo.lockStat(client, restaurantId, 'eta_category_stats')) || {};
  const totalSeed = categories.reduce((s, c) => s + seedForCategory(c), 0) || 1;
  for (const c of categories) {
    const attributed = (duration * seedForCategory(c)) / totalSeed;
    const st = stats[c] || { n: 0, sum: 0 };
    st.n = (st.n || 0) + 1;
    st.sum = (st.sum || 0) + attributed;
    stats[c] = st;
  }
  await repo.upsertStat(client, restaurantId, 'eta_category_stats', JSON.stringify(stats));
}

module.exports = { recordSessionEnd };
