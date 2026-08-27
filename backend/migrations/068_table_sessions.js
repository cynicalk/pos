/*
 * 066_table_sessions
 *
 * Logs one row every time a dining table frees up — the raw history the Phase-2
 * ETA model will learn from, and the source the Phase-1 engine aggregates into
 * running per-category / per-restaurant timing stats.
 *
 * Written from a single chokepoint (tables.service.updateStatus, on the
 * occupied -> available transition) so payment, split-payment, cancellation and
 * manual table-frees are all captured in one place. Logging is fire-and-forget:
 * it must never affect the payment/cancel flow.
 *
 * session_id mirrors orders.table_session_id (migration 045), which already
 * groups every order of one dining party. UNIQUE(session_id) makes logging
 * idempotent — a retried/duplicated free event can't write the session twice.
 *
 * FK conventions match reviews/reservations: restaurant_id CASCADEs (so tenant
 * deletion and test teardown clean up), table_id is SET NULL (history survives a
 * table being deleted).
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS table_sessions (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id     UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      table_id          UUID        REFERENCES tables(id) ON DELETE SET NULL,
      session_id        UUID        NOT NULL UNIQUE,
      waitlist_id       UUID,
      party_size        INTEGER,
      started_at        TIMESTAMPTZ NOT NULL,
      ended_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      duration_minutes  NUMERIC(10,2),
      had_reservation   BOOLEAN     NOT NULL DEFAULT false,
      requested_bill_at TIMESTAMPTZ,
      categories_ordered JSONB      NOT NULL DEFAULT '{}'::jsonb,
      item_count        INTEGER     NOT NULL DEFAULT 0,
      total_amount      NUMERIC(12,2),
      ended_reason      VARCHAR(20) NOT NULL DEFAULT 'paid',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS table_sessions_restaurant_ended_idx
      ON table_sessions (restaurant_id, ended_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS table_sessions_restaurant_ended_idx;
    DROP TABLE IF EXISTS table_sessions;
  `);
};
