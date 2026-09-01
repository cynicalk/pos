const { Pool, types } = require("pg");
require("dotenv").config();

// pg parses `timestamp without time zone` (OID 1114) using the local system
// timezone, which shifts the value when the server isn't in UTC.
// Override the parser to always treat the raw value as UTC so JSON output
// contains a proper ISO-8601 Z-suffix string that browsers parse correctly.
types.setTypeParser(1114, (val) =>
  val ? new Date(val.replace(" ", "T") + "Z").toISOString() : null,
);

// Managed Postgres (Supabase, RDS, …) needs SSL, and serverless functions each
// hold their own tiny pool against a shared connection budget — so both are
// env-driven and default to the local Docker Postgres behaviour untouched.
//   PGSSL=require        → TLS on, transport encrypted. Certificate verification
//                          is RELAXED by default because Supabase's pooler cert
//                          isn't in the system CA bundle. Auto-enabled for supabase hosts.
//   PGSSL=verify         → TLS on AND the server certificate is verified (strict).
//                          Use this with a provider whose CA the host trusts (set
//                          NODE_EXTRA_CA_CERTS if you have Supabase's CA) to close
//                          the MITM window the relaxed mode leaves open.
//   PGPOOL_MAX=<n>       → cap connections per instance (set to 1–3 on serverless,
//                          pointed at Supabase's transaction pooler on port 6543).
const dbUrl = process.env.DATABASE_URL || '';
const strictSsl = process.env.PGSSL === 'verify';
const wantSsl = strictSsl || process.env.PGSSL === 'require' || /supabase\.(co|com)/.test(dbUrl);
const pool = new Pool({
  connectionString: dbUrl,
  ...(wantSsl ? { ssl: { rejectUnauthorized: strictSsl } } : {}),
  ...(process.env.PGPOOL_MAX ? { max: Number(process.env.PGPOOL_MAX) } : {}),
});

// Set each connection's session timezone to UTC so PostgreSQL formats
// timestamp values in UTC before handing them to the type parser above.
pool.on("connect", (client) => {
  // Use a callback form so pg's pool waits for this before releasing the client.
  client.query("SET timezone = 'UTC'", (err) => {
    if (err) console.error("Failed to set session timezone", err);
  });
});

pool.on("error", (err) => {
  console.error("Unexpected DB error", err);
  process.exit(-1);
});

// Run `fn` inside a single transaction. The callback receives a dedicated
// client; the transaction commits on success and rolls back if it throws.
// The client is always released. Returns whatever `fn` resolves to.
//
//   const order = await db.withTransaction(async (client) => {
//     await client.query('INSERT ...');
//     return result;
//   });
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  withTransaction,
  close: () => pool.end(),
};
