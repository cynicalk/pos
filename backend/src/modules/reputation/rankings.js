/**
 * Search-rank tracking and the rating benchmark (MERGE_PLAN.md Phase 6).
 *
 * Both are MANUAL entry — in the source too. The operator searches "biryani
 * near me" on Swiggy, sees themselves at position 7, and types 7 in. Nothing
 * here scrapes anything, and the UI says so; the four Market Intel shells are
 * shelled precisely because scraping is what they would need.
 *
 * The consequence worth stating: this data is as regular as the operator is.
 * Two readings a month apart are a comparison, not a trend, so every derived
 * figure below carries the gap it was measured over rather than implying a
 * steady series.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Below this, "you dropped 3 places" is comparing today against a reading from
// a different season. The observation is still shown; it just isn't called a
// change, and the rules engine won't alert on it.
const MAX_COMPARABLE_GAP_DAYS = 30;

const toTime = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/** Manual entry: one tracked query is one (platform, query) pair. */
const rankKey = (platform, query) => `${platform}\u0000${query}`;

/**
 * Group rank observations into tracked queries.
 * @param {Array<{platform, query, position, total_results, recorded_at}>} rows
 *        Any order; sorted here so callers can't change the answer by changing
 *        their ORDER BY.
 */
function buildTrackedQueries(rows = []) {
  const byKey = new Map();

  for (const row of rows) {
    const key = rankKey(row.platform, row.query);
    const entry = byKey.get(key) || { platform: row.platform, query: row.query, history: [] };
    entry.history.push({
      // The row id travels with the reading so a mistyped position can be
      // removed. Without it the only fix for a typo is a second reading that
      // contradicts the first, which is worse than the typo.
      id:           row.id,
      position:     Number(row.position),
      totalResults: row.total_results == null ? null : Number(row.total_results),
      recordedAt:   row.recorded_at,
    });
    byKey.set(key, entry);
  }

  return [...byKey.values()]
    .map((entry) => {
      const history = entry.history.slice().sort((a, b) => toTime(a.recordedAt) - toTime(b.recordedAt));
      const latest = history[history.length - 1];
      const previous = history.length > 1 ? history[history.length - 2] : null;

      const gapDays = previous
        ? Math.round((toTime(latest.recordedAt) - toTime(previous.recordedAt)) / DAY_MS)
        : null;
      // Lower position is better, so improvement = previous - latest. A positive
      // `change` means moved UP the results.
      const rawChange = previous ? previous.position - latest.position : null;
      const comparable = gapDays !== null && gapDays <= MAX_COMPARABLE_GAP_DAYS;

      return {
        platform:         entry.platform,
        query:            entry.query,
        latestPosition:   latest.position,
        latestTotal:      latest.totalResults,
        latestRecordedAt: latest.recordedAt,
        previousPosition: previous ? previous.position : null,
        // Null when there is nothing to compare against OR when the gap is too
        // wide to call it movement. `gapDays` says which.
        change:           comparable ? rawChange : null,
        gapDays,
        stale:            gapDays !== null && !comparable,
        readings:         history.length,
        history,
      };
    })
    // Worst position first: an operator opening this page wants the query they
    // are losing, not the one they already win.
    .sort((a, b) => b.latestPosition - a.latestPosition
      || a.query.localeCompare(b.query));
}

/**
 * Own rating vs manually-recorded competitor ratings.
 *
 * `ownRating` comes from POS reviews — first-party feedback from guests at a
 * table. Competitor ratings are read off a public platform. These are NOT the
 * same measurement, and the delta between them is softer than it looks; the
 * page says so rather than the number pretending otherwise.
 */
function buildBenchmark({ ownRating, ownReviewCount, competitorRows = [] }) {
  const own = ownRating == null ? null : Number(ownRating);

  // Latest reading per competitor+platform. Rows arrive newest-first.
  const latest = new Map();
  for (const row of competitorRows) {
    const key = `${String(row.competitor_name).trim().toLowerCase()}\u0000${row.platform}`;
    if (!latest.has(key)) latest.set(key, row);
  }

  const competitors = [...latest.values()]
    .map((row) => {
      const rating = Number(row.rating);
      return {
        id:             row.id,
        competitorName: row.competitor_name,
        platform:       row.platform,
        rating,
        recordedAt:     row.recorded_at,
        // Positive = we are ahead. Null when we have no reviews of our own,
        // because "ahead of them by 4.3" would be nonsense.
        delta: own == null ? null : Math.round((own - rating) * 10) / 10,
      };
    })
    .sort((a, b) => b.rating - a.rating);

  const ahead = own == null ? null : competitors.filter((c) => c.delta > 0).length;

  return {
    ownRating: own == null ? null : Math.round(own * 10) / 10,
    ownReviewCount: Number(ownReviewCount) || 0,
    competitors,
    ahead,
    tracked: competitors.length,
  };
}

module.exports = { buildTrackedQueries, buildBenchmark, rankKey, MAX_COMPARABLE_GAP_DAYS };
