// Fixed-window rate limiter.
// Uses Redis (via REDIS_URL) when available; falls back to in-memory so local
// dev and single-instance deployments work without any extra infrastructure.
// Callers keep the same { windowMs, max, key?, message? } signature.
//
// resetBuckets() is exported for tests: call it in beforeAll to clear all
// in-memory state so successive test suites don't share rate-limit counters.

const INCR_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return count
`;

// ── In-memory fallback ────────────────────────────────────────────────────────

const _allBuckets = [];

function makeMemoryLimiter({ windowMs, max, key, message }) {
  const buckets = new Map();
  _allBuckets.push(buckets);

  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
  }, Math.max(windowMs, 30_000)).unref();

  return (req, res, next) => {
    const k = key(req);
    if (!k) return next();
    const now = Date.now();
    let entry = buckets.get(k);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      buckets.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

function resetBuckets() {
  for (const b of _allBuckets) b.clear();
}

// ── Redis client (module-level singleton) ─────────────────────────────────────

let _redis = null;
let _redisOk = false;

function initRedis() {
  if (!process.env.REDIS_URL) return;
  try {
    const Redis = require('ioredis');
    _redis = new Redis(process.env.REDIS_URL, { lazyConnect: false, enableReadyCheck: false });
    _redis.on('ready', () => {
      _redisOk = true;
      console.log('Rate limiter: Redis connected');
    });
    _redis.on('error', (err) => {
      _redisOk = false;
      console.error('Rate limiter: Redis error, falling back to memory —', err.message);
    });
  } catch {
    console.warn('Rate limiter: ioredis unavailable, using in-memory fallback');
  }
}

initRedis();

// ── Redis limiter ─────────────────────────────────────────────────────────────

function makeRedisLimiter({ windowMs, max, key, message }, fallback) {
  return async (req, res, next) => {
    if (!_redisOk) return fallback(req, res, next);

    const k = key(req);
    if (!k) return next();

    try {
      const windowId = Math.floor(Date.now() / windowMs);
      const redisKey = `rl:${k}:${windowId}`;
      const count = await _redis.eval(INCR_SCRIPT, 1, redisKey, windowMs);

      if (count > max) {
        const windowEnd = (windowId + 1) * windowMs;
        res.set('Retry-After', Math.ceil((windowEnd - Date.now()) / 1000));
        return res.status(429).json({ error: message });
      }
      next();
    } catch (err) {
      console.error('Rate limiter: Redis eval failed, using memory fallback —', err.message);
      fallback(req, res, next);
    }
  };
}

// ── Public factory ────────────────────────────────────────────────────────────

function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Too many requests' }) {
  const fallback = makeMemoryLimiter({ windowMs, max, key, message });
  return makeRedisLimiter({ windowMs, max, key, message }, fallback);
}

module.exports = { rateLimit, resetBuckets };
