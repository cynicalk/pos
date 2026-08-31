/**
 * A tiny per-process TTL cache for read-through of expensive, tolerant-of-slight-
 * staleness aggregates.
 *
 * Reco performance is read on the Recommendations page, both narrated briefs, the
 * action evaluator, every reco outcome measurement, and — its activity slice — on
 * every guest menu load. None of them need second-fresh numbers: the underlying
 * `guest_events` move at the pace of guests ordering, not of requests. A short
 * TTL collapses a burst of those reads into one query without risking a stale
 * figure an operator would notice.
 *
 * Deliberately minimal: a Map keyed by a caller-built string, values stamped with
 * an expiry, evicted lazily on read (and the whole entry set can be cleared).
 * Single-process only — a horizontally-scaled deployment would move this to Redis,
 * but the correctness never depends on the cache, only the latency.
 */
function createTtlCache(defaultTtlMs = 60_000) {
  const store = new Map();

  async function wrap(key, ttlMs, producer) {
    const now = Date.now();
    const hit = store.get(key);
    if (hit && hit.expires > now) return hit.value;
    const value = await producer();
    store.set(key, { value, expires: now + (ttlMs ?? defaultTtlMs) });
    return value;
  }

  function clear(prefix) {
    if (!prefix) return store.clear();
    for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
  }

  return { wrap, clear };
}

module.exports = { createTtlCache };
