const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const db  = require('./db');

let wss;

const TOKEN_REVALIDATION_INTERVAL_MS = 15 * 60 * 1000;

// ── Cookie helper ─────────────────────────────────────────────────────────────

function parseCookieToken(cookieHeader = '') {
  const map = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), decodeURIComponent(v.join('=').trim())];
    }).filter(([k]) => k),
  );
  return map.pos_token || map.admin_token || null;
}

// ── Optional Redis pub/sub for horizontal scaling ─────────────────────────────
// Set REDIS_URL to enable; otherwise falls back to in-process broadcasting.

let _redisReady  = false;
let _redisPub    = null;
let _redisSub    = null;

function initRedis() {
  if (!process.env.REDIS_URL) return;
  try {
    const Redis = require('ioredis');
    _redisPub = new Redis(process.env.REDIS_URL, { lazyConnect: false, enableReadyCheck: false });
    _redisSub = new Redis(process.env.REDIS_URL, { lazyConnect: false, enableReadyCheck: false });

    _redisSub.subscribe('ws:broadcast', (err) => {
      if (err) { console.error('Redis subscribe error:', err); return; }
      _redisReady = true;
      console.log('WebSocket Redis pub/sub enabled');
    });

    _redisSub.on('message', (_ch, raw) => {
      try {
        const { restaurantId, userId, message } = JSON.parse(raw);
        broadcastLocal(message, restaurantId, userId);
      } catch {}
    });

    _redisPub.on('error', (e) => console.error('Redis pub error:', e));
    _redisSub.on('error', (e) => console.error('Redis sub error:', e));
  } catch {
    console.warn('ioredis not available — WebSocket broadcasts are in-process only');
  }
}

// ── Token revalidation ────────────────────────────────────────────────────────

async function revalidateClients() {
  if (!wss) return;
  for (const client of wss.clients) {
    if (client.readyState !== 1 || !client._wsToken) continue;
    try {
      const decoded = jwt.verify(client._wsToken, process.env.JWT_SECRET);
      if (decoded.userId) {
        const { rows } = await db.query(
          'SELECT is_active, EXTRACT(EPOCH FROM password_changed_at)::bigint AS pca FROM users WHERE id = $1',
          [decoded.userId],
        );
        const user = rows[0];
        // Drop the socket if the account was deleted, disabled, or its password changed.
        if (!user || user.is_active === false ||
            (user.pca != null && Number(user.pca) > decoded.iat)) {
          client.terminate();
        }
      }
    } catch {
      client.terminate();
    }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init(server) {
  const allowedOrigins = (process.env.CORS_ORIGINS ||
    'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176')
    .split(',').map((s) => s.trim()).filter(Boolean);

  setInterval(revalidateClients, TOKEN_REVALIDATION_INTERVAL_MS).unref();

  initRedis();

  wss = new WebSocketServer({
    server,
    verifyClient: ({ req, origin }, cb) => {
      // Origin check (same as before)
      if (origin && !allowedOrigins.includes(origin)) {
        return cb(false, 403, 'Origin not allowed');
      }

      // Authenticate via HttpOnly cookie carried in the upgrade request
      const token = parseCookieToken(req.headers.cookie || '');
      if (!token) return cb(false, 401, 'Unauthorized');

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Attach to req so the connection handler can read them
        req._wsUserId       = decoded.userId ?? null;
        req._wsRestaurantId = decoded.restaurantId ?? null;
        req._wsToken        = token;
        cb(true);
      } catch {
        cb(false, 401, 'Invalid or expired token');
      }
    },
  });

  wss.on('connection', (ws, req) => {
    // Identity already verified in verifyClient
    ws.restaurantId = req._wsRestaurantId;
    ws.userId       = req._wsUserId;
    ws._wsToken     = req._wsToken;
    ws.role         = null;

    // Fetch role for targeted broadcasts — one DB hit per connection
    if (ws.userId) {
      db.query('SELECT role FROM users WHERE id = $1', [ws.userId])
        .then(({ rows }) => { ws.role = rows[0]?.role ?? null; })
        .catch(() => {});
    }

    ws.send(JSON.stringify({ event: 'CONNECTED', data: {}, timestamp: Date.now() }));

    ws.on('error', (err) => console.error('WebSocket error:', err));
  });
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────

function broadcastLocal(message, restaurantId, userId) {
  if (!wss || !restaurantId) return;
  wss.clients.forEach((client) => {
    if (client.readyState !== 1) return;
    if (client.restaurantId !== restaurantId) return;
    if (userId && client.userId !== userId) return;
    client.send(message);
  });
}

function broadcast(event, data, restaurantId) {
  if (!restaurantId) return;
  const message = JSON.stringify({ event, data, timestamp: Date.now() });
  if (_redisReady && _redisPub) {
    _redisPub.publish('ws:broadcast', JSON.stringify({ restaurantId, message }));
  } else {
    broadcastLocal(message, restaurantId, null);
  }
}

function sendToUser(userId, event, data, restaurantId) {
  if (!userId) return;
  const message = JSON.stringify({ event, data, timestamp: Date.now() });
  if (_redisReady && _redisPub) {
    _redisPub.publish('ws:broadcast', JSON.stringify({ restaurantId, userId, message }));
  } else {
    broadcastLocal(message, restaurantId, userId);
  }
}

// Send to all clients whose role is in `roles` OR whose userId matches `userId`.
// Used for dine-in orders: admin + kitchen always see them; only the assigned staff member does too.
function broadcastToRolesOrUser(event, data, restaurantId, roles, userId) {
  if (!wss || !restaurantId) return;
  const roleSet  = new Set(roles);
  const message  = JSON.stringify({ event, data, timestamp: Date.now() });
  wss.clients.forEach((client) => {
    if (client.readyState !== 1) return;
    if (client.restaurantId !== restaurantId) return;
    if (roleSet.has(client.role) || client.userId === userId) {
      client.send(message);
    }
  });
}

module.exports = { init, broadcast, sendToUser, broadcastToRolesOrUser };
