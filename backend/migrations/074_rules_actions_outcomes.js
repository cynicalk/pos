/*
 * 074_rules_actions_outcomes
 *
 * The alerting spine, ported from the ops back-office (Rule / Action / Outcome).
 * Phase 2 of the merge; see MERGE_PLAN.md §4.
 *
 * This lands before compliance and SOPs on purpose: once it exists, later
 * phases register a rule instead of each building its own notification path.
 *
 * Three deliberate departures from the source schema:
 *
 * 1. `rules.restaurant_id` — the ops app kept Rule global, with no tenant at
 *    all. POS is multi-tenant and an operator should be able to tune their own
 *    thresholds (a cloud kitchen's acceptable cancellation rate is not a fine
 *    diner's) without moving everyone else's. Rules are therefore seeded per
 *    restaurant on first evaluation, the way `settings` already works.
 *
 * 2. `dedupe_key` carries the uniqueness, not the title. Titles embed live
 *    numbers ("seated 32 minutes", "rate 11.4%"), so keying on them would
 *    re-raise the same issue every time the number moved. This is the source's
 *    reasoning and it is preserved exactly.
 *
 * 3. The source's `before_period` / `after_period` daterange columns are
 *    dropped. Prisma marked them Unsupported and nothing read them; `created_at`
 *    (when the baseline was taken) and `measured_at` (when it was re-measured)
 *    carry the same information in a type every client can read.
 *
 * `tables.occupied_at` is here rather than in its own migration because the
 * stalled_table rule cannot exist without it. POS tracks `tables.status` as a
 * bare enum with no timestamp, so "seated N minutes without ordering" was not
 * derivable at all. It is nullable and only ever set going forward — a table
 * already occupied when this migration runs has no honest seating time, and the
 * rule skips NULLs rather than inventing one.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS rules (
      id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id    UUID         NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      rule_type        VARCHAR(50)  NOT NULL,
      condition        JSONB        NOT NULL,
      severity         VARCHAR(20)  NOT NULL DEFAULT 'medium',
      message_template TEXT,
      enabled          BOOLEAN      NOT NULL DEFAULT true,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

      CONSTRAINT rules_severity_check
        CHECK (severity IN ('low','medium','high','critical')),
      -- One rule per (type, severity) per restaurant: a type may carry tiers
      -- (a small variance at medium, a large one at high) without duplicating.
      UNIQUE (restaurant_id, rule_type, severity)
    );

    CREATE TABLE IF NOT EXISTS actions (
      id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id   UUID         NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      rule_id         UUID         REFERENCES rules(id) ON DELETE SET NULL,
      action_type     VARCHAR(20)  NOT NULL DEFAULT 'recommendation',
      dedupe_key      TEXT         NOT NULL,
      assigned_to_id  UUID         REFERENCES users(id) ON DELETE SET NULL,
      title           TEXT         NOT NULL,
      description     TEXT,
      priority        VARCHAR(20)  NOT NULL DEFAULT 'medium',
      status          VARCHAR(20)  NOT NULL DEFAULT 'open',
      delivered_via   VARCHAR(20),
      created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
      acknowledged_at TIMESTAMPTZ,
      resolved_at     TIMESTAMPTZ,

      CONSTRAINT actions_type_check
        CHECK (action_type IN ('alert','recommendation','task')),
      CONSTRAINT actions_priority_check
        CHECK (priority IN ('low','medium','high','critical')),
      CONSTRAINT actions_status_check
        CHECK (status IN ('open','acknowledged','acted_on','dismissed'))
    );

    -- The dedupe lookup: "is this condition already unresolved for this tenant".
    CREATE INDEX IF NOT EXISTS actions_dedupe_idx
      ON actions (restaurant_id, dedupe_key, status);
    -- The queue read: open actions for a restaurant, newest first.
    CREATE INDEX IF NOT EXISTS actions_restaurant_status_idx
      ON actions (restaurant_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS outcomes (
      id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id UUID          NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      action_id    UUID           NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
      metric_name  VARCHAR(50)    NOT NULL,
      before_value NUMERIC(12,4),
      after_value  NUMERIC(12,4),
      delta_pct    NUMERIC(8,4),
      verdict      VARCHAR(20),
      created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
      measured_at  TIMESTAMPTZ,

      CONSTRAINT outcomes_verdict_check
        CHECK (verdict IS NULL OR verdict IN ('improved','worsened','inconclusive')),
      -- One outcome per action: the baseline is taken once, when the operator
      -- says they acted. A second baseline would silently reset the comparison.
      UNIQUE (action_id)
    );

    CREATE INDEX IF NOT EXISTS outcomes_restaurant_idx ON outcomes (restaurant_id);

    -- When this table became occupied. Required by the stalled_table rule; see
    -- the header note on why it can only ever be filled going forward.
    ALTER TABLE tables ADD COLUMN IF NOT EXISTS occupied_at TIMESTAMPTZ;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE tables DROP COLUMN IF EXISTS occupied_at;
    DROP TABLE IF EXISTS outcomes;
    DROP TABLE IF EXISTS actions;
    DROP TABLE IF EXISTS rules;
  `);
};
