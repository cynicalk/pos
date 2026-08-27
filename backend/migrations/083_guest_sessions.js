/**
 * Shared-table sessions for the guest dine-in app's Joined Cart.
 *
 * The guest app lets a table build one order together across phones: whoever
 * scans first opens a table and gets a short join code, everyone else joins on
 * that code, and the cart + members + party settings sync between them. The app
 * owns the shape of that document (`SharedTableDoc`) and treats the backend as
 * verbatim storage with a revision counter for last-writer-wins — so this table
 * stores the doc as opaque JSONB rather than modelling its innards, which keeps
 * the guest UI free to evolve without a migration here.
 *
 * `code` is the human join code shown on screen; it is unique per restaurant,
 * not globally, so two venues can both hand out "4821" on the same night.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE guest_sessions (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      code          text NOT NULL,
      -- The SharedTableDoc, stored exactly as the guest app sends it.
      doc           jsonb NOT NULL DEFAULT '{}',
      -- Monotonic revision — the app bumps it on every push; a stale push loses.
      rev           integer NOT NULL DEFAULT 0,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    );

    -- Join codes are looked up per restaurant and must be unique within one.
    CREATE UNIQUE INDEX guest_sessions_restaurant_code_idx
      ON guest_sessions (restaurant_id, code);
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS guest_sessions;');
};
