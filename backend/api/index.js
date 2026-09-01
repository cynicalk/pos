// Vercel serverless entry for the Express API.
//
// server.js is the persistent-host entry: it wraps `app` in an http.Server and
// attaches the WebSocket server for live KDS/order push. Vercel's serverless
// functions can't hold a socket open, so this entry imports `app` ALONE — no
// WebSocket. Every ws broadcast in the code already guards `if (!wss) return`
// (see shared/websocket.js), so they become no-ops here and the surfaces that
// relied on instant push fall back to the dashboard's existing 30s auto-refresh.
//
// If you need real-time push in production, host the backend on a persistent
// runtime (Railway / Render / Fly) using `npm start` (server.js) instead, with
// Postgres still on Supabase — the frontends don't care which, they only need the
// API origin. See DEPLOY.md.
module.exports = require('../src/app');
