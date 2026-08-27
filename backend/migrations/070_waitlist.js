/*
 * 068_waitlist
 *
 * The walk-in queue. A waiting party self-onboards from the restaurant door QR
 * (restaurants.public_token, migration 065) or is added by staff, and watches a
 * live ETA. Each row carries its own public_token so the guest can poll their
 * own status from the web app without auth (same pattern as tables.public_token).
 *
 * prefs (jsonb) captures the E-waiter onboarding answers (purpose / group type /
 * food preferences) for later recommendations — stored now, used later.
 *
 * FK conventions match the rest of the schema: restaurant_id CASCADEs;
 * assigned_table_id is SET NULL so a deleted table doesn't drop the entry.
 * We also wire table_sessions.waitlist_id (the column added in 066) to this new
 * table now that it exists, so a finished session can point back at the party.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id          UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      public_token           UUID        NOT NULL DEFAULT gen_random_uuid(),
      guest_name             TEXT        NOT NULL,
      guest_phone            TEXT,
      whatsapp_opt_in        BOOLEAN     NOT NULL DEFAULT false,
      party_size             INTEGER     NOT NULL CHECK (party_size >= 1),
      allow_extra_chair      BOOLEAN     NOT NULL DEFAULT false,
      prefs                  JSONB       NOT NULL DEFAULT '{}'::jsonb,
      status                 VARCHAR(20) NOT NULL DEFAULT 'waiting',
      estimated_wait_minutes INTEGER,
      assigned_table_id      UUID        REFERENCES tables(id) ON DELETE SET NULL,
      joined_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      seated_at              TIMESTAMPTZ,
      notified_ready_at      TIMESTAMPTZ,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS waitlist_public_token_idx ON waitlist (public_token);

    -- Queue scans key on (restaurant, status, joined_at) — the priority order.
    CREATE INDEX IF NOT EXISTS waitlist_restaurant_status_idx
      ON waitlist (restaurant_id, status, joined_at);

    -- Now that waitlist exists, point the session's waitlist_id at it.
    ALTER TABLE table_sessions
      ADD CONSTRAINT table_sessions_waitlist_id_fkey
      FOREIGN KEY (waitlist_id) REFERENCES waitlist(id) ON DELETE SET NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE table_sessions DROP CONSTRAINT IF EXISTS table_sessions_waitlist_id_fkey;
    DROP TABLE IF EXISTS waitlist;
  `);
};
