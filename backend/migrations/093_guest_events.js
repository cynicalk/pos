/**
 * Guest recommendation events — Phase 0 of the recsys work.
 *
 * The group recommender must not be *modelled* before there are 2-3 weeks of
 * clean impression/add/refine/order logs (see ROADMAP "Recsys — gated on Phase 0
 * logging"). So the first build is the log, not a model. The guest app already
 * *emits* these events client-side (guest-app/lib/analytics.ts); it never had a
 * destination on our side. This table is that destination.
 *
 * One row per event the phone-at-the-table fires:
 *   funnel_step | recommendations_shown | dish_added | dish_removed |
 *   reco_rejected | order_placed | order_failed
 *
 * The join keys are lifted into their own columns so the operator funnel and the
 * reco→margin loop are plain aggregates, and the whole original payload is kept
 * in `props` so nothing the app sends is discarded:
 *   - session_id : the guest's per-browser session — the natural funnel unit.
 *   - seq        : monotonic within a session; with session_id it makes an event
 *                  idempotent, so a re-sent batch (the sink retries) inserts once.
 *   - menu_item_id / source : only present on dish_added/dish_removed, resolved
 *                  from props.dishId at ingest so the margin loop can join to the
 *                  menu-engineering matrix without re-parsing JSON.
 *
 * FK on menu_item_id is intentionally omitted: a dish removed from the menu after
 * a guest interacted with it must not delete the historical event, and an id the
 * app sends that no longer resolves is stored as NULL (dish_name keeps the label).
 * Telemetry is best-effort by design — the ingest never blocks the guest flow.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE guest_events (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      session_id    TEXT NOT NULL,
      seq           INTEGER NOT NULL,
      event         TEXT NOT NULL,
      source        TEXT,
      menu_item_id  UUID,
      dish_name     TEXT,
      props         JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at   TIMESTAMPTZ NOT NULL,
      received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (restaurant_id, session_id, seq)
    );
    CREATE INDEX idx_guest_events_window ON guest_events (restaurant_id, occurred_at);
    CREATE INDEX idx_guest_events_kind   ON guest_events (restaurant_id, event, occurred_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS guest_events;');
};
