/**
 * Autopilot action log — the audit trail for the one autonomous action CookLyt
 * takes on the operator's behalf.
 *
 * The whole product discipline is "tell the operator, don't act blindly". Autopilot
 * is the deliberate, narrow exception: when the recommender is verifiably leaking
 * margin AND the operator has switched autopilot on, the system auto-features the
 * top high-margin dish the recommender under-shows — the same one the
 * reco_underexposed action would have suggested. Every such action is written here
 * so it is fully visible and reversible: `reverted_at` records an undo, and the
 * cap on concurrent autopilot-featured dishes reads off this table.
 *
 * Deliberately not a generic "agent did something" table — one action type, one
 * entity (the menu item), so the audit stays legible and the blast radius stays
 * small until the operator trusts it.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE autopilot_actions (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      action_type    TEXT NOT NULL,            -- 'feature_dish'
      menu_item_id   UUID REFERENCES menu_items(id) ON DELETE SET NULL,
      detail         TEXT NOT NULL,            -- human-readable "why"
      reverted_at    TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_autopilot_active ON autopilot_actions (restaurant_id) WHERE reverted_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS autopilot_actions;');
};
