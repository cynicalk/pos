const http = require("http");
const app = require("./app");
const ws = require("./shared/websocket");
const db = require("./shared/db");
const reservationScheduler = require("./scheduler/reservations.scheduler");
const wasteInsightsScheduler = require("./scheduler/waste-insights.scheduler");
const snapshotsScheduler = require("./scheduler/snapshots.scheduler");
const rulesScheduler = require("./scheduler/rules.scheduler");
const reputationScheduler = require("./scheduler/reputation.scheduler");

const PORT = process.env.PORT || 3000;

// Behind a reverse proxy (Nginx, ELB, Cloudflare etc.), trust the first hop so
// req.ip reflects the real client. Configure via TRUST_PROXY env var.
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", process.env.TRUST_PROXY);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("FATAL: JWT_SECRET must be set and at least 32 characters");
  process.exit(1);
}

if (process.env.NODE_ENV === "production" && !process.env.TRUST_PROXY) {
  console.warn(
    "WARNING: TRUST_PROXY is not set. If this server runs behind a reverse proxy " +
    "(Nginx, ELB, Cloudflare), set TRUST_PROXY=1 so req.ip reflects the real client IP. " +
    "Without it, IP-based rate limiting will key on the proxy address instead of the client."
  );
}

const server = http.createServer(app);
ws.init(server);
reservationScheduler.start();
wasteInsightsScheduler.start();
snapshotsScheduler.start();
rulesScheduler.start();
reputationScheduler.start();

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});

// Graceful shutdown: stop accepting connections, finish in-flight requests, close DB pool.
function shutdown(signal) {
  console.log(`${signal} received — shutting down`);
  server.close(async () => {
    try { await db.close(); } catch {}
    process.exit(0);
  });
  // Force-exit if connections don't drain within 10 s
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
