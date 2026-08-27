/**
 * Repeat rate and winback (MERGE_PLAN.md Phase 6).
 *
 * The source built this over a `Visit` table that recorded every walk-in with a
 * phone number, so it saw nearly every guest. The POS has no such table and one
 * is NOT being added: the phone number lives on loyalty_customers, and orders
 * carry loyalty_customer_id whenever a guest was identified at the till.
 *
 * That difference matters enough to be part of the output rather than a caveat
 * in a comment. The POS only knows the guests who joined loyalty or gave their
 * number, which on most floors is a minority of covers. So every figure here
 * ships with `coverage`: how many orders in the window were attributable to a
 * known guest at all. A repeat rate of 61% means 61% OF THE GUESTS WE CAN SEE,
 * and reporting it without saying so would make a loyalty-programme artefact
 * look like a fact about the restaurant.
 *
 * Pure — the caller supplies rows and `now`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// A guest who hasn't returned in this long is "lapsed" — the winback list.
// 30 days is the source's number and a reasonable default for a restaurant
// someone might visit monthly; it is not tuned per venue and shouldn't be
// presented as if it were.
const LAPSED_AFTER_DAYS = 30;

// Repeat rate over fewer identified guests than this is a ratio of small
// numbers: two guests, one of whom returned, is not a 50% repeat rate.
const MIN_GUESTS_FOR_RATE = 10;

const toTime = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/**
 * @param {Array<{customer_id, phone, name, visits, last_visit, first_visit, total_spend}>} rows
 *        One row per identified guest — grouping happens in SQL, which can do
 *        it over the whole table without loading every order into memory.
 * @param {{identifiedOrders: number, totalOrders: number, windowDays: number}} counts
 */
function buildGuestMetrics(rows = [], counts = {}, now = Date.now()) {
  const lapsedCutoff = now - LAPSED_AFTER_DAYS * DAY_MS;

  const guests = rows.map((row) => {
    const lastVisit = row.last_visit;
    const visits = Number(row.visits) || 0;
    const totalSpend = Number(row.total_spend) || 0;
    return {
      customerId:  row.customer_id,
      phone:       row.phone,
      name:        row.name || null,
      visits,
      firstVisit:  row.first_visit,
      lastVisit,
      totalSpend:  Math.round(totalSpend * 100) / 100,
      // Per-visit average, not per-order: a guest who orders twice in one
      // sitting spent that money on one occasion.
      avgSpend:    visits > 0 ? Math.round((totalSpend / visits) * 100) / 100 : 0,
      daysSince:   Math.floor((now - toTime(lastVisit)) / DAY_MS),
      lapsed:      toTime(lastVisit) < lapsedCutoff,
      repeat:      visits >= 2,
    };
  }).sort((a, b) => toTime(b.lastVisit) - toTime(a.lastVisit));

  const repeatGuests = guests.filter((g) => g.repeat).length;
  const identifiedOrders = Number(counts.identifiedOrders) || 0;
  const totalOrders      = Number(counts.totalOrders) || 0;

  const lapsed = guests.filter((g) => g.lapsed);

  return {
    uniqueGuests: guests.length,
    repeatGuests,
    // Null below the floor rather than a percentage nobody should act on.
    repeatRatePct: guests.length >= MIN_GUESTS_FOR_RATE
      ? Math.round((repeatGuests / guests.length) * 100)
      : null,
    minGuestsForRate: MIN_GUESTS_FOR_RATE,
    lapsedAfterDays: LAPSED_AFTER_DAYS,
    coverage: {
      identifiedOrders,
      totalOrders,
      // What share of orders could be attributed to a guest at all. This is the
      // number that tells the operator how much of their floor these metrics
      // actually describe.
      pct: totalOrders > 0 ? Math.round((identifiedOrders / totalOrders) * 100) : null,
      windowDays: Number(counts.windowDays) || null,
    },
    // Winback candidates: lapsed, and worth the message. Sorted by how much
    // they used to spend — the returning-customer value is the point, not the
    // length of the list.
    lapsedGuests: lapsed
      .slice()
      .sort((a, b) => b.totalSpend - a.totalSpend),
    lapsedCount: lapsed.length,
    // Value sitting in the lapsed list, stated as what they HAVE spent, never
    // as what they would spend if they came back. We have no basis for that.
    lapsedHistoricSpend: Math.round(lapsed.reduce((s, g) => s + g.totalSpend, 0) * 100) / 100,
    recentGuests: guests.slice(0, 20),
  };
}

module.exports = { buildGuestMetrics, LAPSED_AFTER_DAYS, MIN_GUESTS_FOR_RATE };
