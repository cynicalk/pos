/*
 * 076_procurement_and_labour
 *
 * Phase 4 of the merge (MERGE_PLAN.md §4): the kitchen, procurement and labour
 * data-entry gateways, ported from the ops back-office.
 *
 * Four things land together because each is useless without the others: a price
 * history to cost against, suppliers to buy from, purchase orders to buy with,
 * and shifts to put the labour half of prime cost on the board.
 *
 * ── Why the price history is enforced by a trigger ──────────────────────────
 *
 * `ingredients.latest_unit_cost` already had TWO write paths before this
 * migration (a manual edit and recordPurchase), and Phase 4 adds two more
 * (invoice intake, PO receipt). The source appended to its history by hand at
 * each call site, guarded so a rejected write couldn't leave an orphan row
 * behind. A trigger gets the same guarantee for free — it fires only when an
 * UPDATE actually lands — and it cannot be forgotten by the next call site
 * somebody adds. An append-only trail that one code path can bypass is not
 * append-only; every margin figure and the cost_spike rule read from it.
 *
 * The trigger takes the source from a transaction-local setting so an invoice
 * import can label its rows without changing the ingredient write itself:
 *   SET LOCAL cooklyt.price_source = 'invoice';
 * Unset, it records 'manual'.
 *
 * Existing costs are backfilled as one 'baseline' row each. Without it the
 * history opens empty and the cost_spike rule has nothing to compare a first
 * real price change against. The row is labelled 'baseline' precisely so it is
 * never mistaken for an observed price change on a date it did not happen.
 */
exports.up = (pgm) => {
  pgm.sql(`
    -- ── Ingredient price history (append-only) ──────────────────────────────
    CREATE TABLE IF NOT EXISTS ingredient_prices (
      id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id UUID          NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      ingredient_id UUID          NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
      cost_per_unit NUMERIC(10,4) NOT NULL,
      source        VARCHAR(20)   NOT NULL DEFAULT 'manual',
      recorded_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),

      CONSTRAINT ingredient_prices_source_check
        CHECK (source IN ('manual','invoice','purchase','baseline'))
    );

    CREATE INDEX IF NOT EXISTS ingredient_prices_ingredient_idx
      ON ingredient_prices (ingredient_id, recorded_at DESC);

    CREATE OR REPLACE FUNCTION ingredients_record_price()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.latest_unit_cost IS DISTINCT FROM OLD.latest_unit_cost THEN
        INSERT INTO ingredient_prices (restaurant_id, ingredient_id, cost_per_unit, source)
        VALUES (
          NEW.restaurant_id, NEW.id, NEW.latest_unit_cost,
          COALESCE(NULLIF(current_setting('cooklyt.price_source', true), ''), 'manual')
        );
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER ingredients_record_price_trg
      AFTER UPDATE OF latest_unit_cost ON ingredients
      FOR EACH ROW EXECUTE FUNCTION ingredients_record_price();

    -- Also capture the opening cost of a brand-new ingredient.
    CREATE OR REPLACE FUNCTION ingredients_record_initial_price()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.latest_unit_cost IS NOT NULL AND NEW.latest_unit_cost > 0 THEN
        INSERT INTO ingredient_prices (restaurant_id, ingredient_id, cost_per_unit, source)
        VALUES (
          NEW.restaurant_id, NEW.id, NEW.latest_unit_cost,
          COALESCE(NULLIF(current_setting('cooklyt.price_source', true), ''), 'manual')
        );
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER ingredients_record_initial_price_trg
      AFTER INSERT ON ingredients
      FOR EACH ROW EXECUTE FUNCTION ingredients_record_initial_price();

    -- One opening row per ingredient that already has a cost.
    INSERT INTO ingredient_prices (restaurant_id, ingredient_id, cost_per_unit, source)
    SELECT restaurant_id, id, latest_unit_cost, 'baseline'
    FROM ingredients
    WHERE latest_unit_cost > 0;

    -- ── Suppliers ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS suppliers (
      id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id  UUID         NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name           VARCHAR(200) NOT NULL,
      phone          VARCHAR(40),
      -- Days between placing an order and it arriving. Drives the reorder
      -- point: you have to re-order while there is still enough stock to cover
      -- the wait. Defaults to 2 rather than 0, because a 0-day lead time
      -- computes a reorder point of just the safety buffer and tells the
      -- operator to order far too late.
      lead_time_days INTEGER      NOT NULL DEFAULT 2 CHECK (lead_time_days >= 0),
      is_active      BOOLEAN      NOT NULL DEFAULT true,
      created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

      UNIQUE (restaurant_id, name)
    );

    ALTER TABLE ingredients
      ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS ingredients_supplier_idx ON ingredients (supplier_id);

    -- ── Purchase orders ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id UUID          NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      supplier_id   UUID          NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      status        VARCHAR(20)   NOT NULL DEFAULT 'draft',
      -- Set when the delivery physically arrived. Receipt also books each line
      -- into inventory_transactions, so stock and the ledger cannot disagree.
      received_at   TIMESTAMPTZ,
      -- Lines are a snapshot: [{ingredientId, name, unit, quantity, unitCost,
      -- lineTotal}] frozen at creation, so a later price change never rewrites
      -- what was actually ordered.
      lines         JSONB         NOT NULL DEFAULT '[]'::jsonb,
      total         NUMERIC(12,2) NOT NULL DEFAULT 0,
      notes         TEXT,
      created_by    UUID          REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),

      CONSTRAINT purchase_orders_status_check
        CHECK (status IN ('draft','sent','received','cancelled'))
    );

    CREATE INDEX IF NOT EXISTS purchase_orders_restaurant_idx
      ON purchase_orders (restaurant_id, status, created_at DESC);

    -- ── Labour ──────────────────────────────────────────────────────────────
    -- The default rate for a staff member. The rate that actually costs a shift
    -- is snapshotted onto the shift row, so a raise never silently rewrites
    -- what last month's labour cost.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(8,2);

    CREATE TABLE IF NOT EXISTS staff_shifts (
      id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id UUID          NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      work_date     DATE          NOT NULL,
      -- Null while a shift is only scheduled or still running; filled on
      -- clock-out, or entered directly for a manual labour log.
      hours         NUMERIC(5,2)  CHECK (hours IS NULL OR hours >= 0),
      hourly_rate   NUMERIC(8,2)  NOT NULL CHECK (hourly_rate >= 0),
      clock_in_at   TIMESTAMPTZ,
      clock_out_at  TIMESTAMPTZ,
      status        VARCHAR(20)   NOT NULL DEFAULT 'completed',
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),

      CONSTRAINT staff_shifts_status_check
        CHECK (status IN ('scheduled','active','completed'))
    );

    CREATE INDEX IF NOT EXISTS staff_shifts_restaurant_date_idx
      ON staff_shifts (restaurant_id, work_date DESC);
    -- Only one shift may be running per person at a time.
    CREATE UNIQUE INDEX IF NOT EXISTS staff_shifts_one_active_idx
      ON staff_shifts (user_id) WHERE status = 'active';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS staff_shifts;
    ALTER TABLE users DROP COLUMN IF EXISTS hourly_rate;
    DROP TABLE IF EXISTS purchase_orders;
    ALTER TABLE ingredients DROP COLUMN IF EXISTS supplier_id;
    DROP TABLE IF EXISTS suppliers;
    DROP TRIGGER IF EXISTS ingredients_record_price_trg ON ingredients;
    DROP TRIGGER IF EXISTS ingredients_record_initial_price_trg ON ingredients;
    DROP FUNCTION IF EXISTS ingredients_record_price();
    DROP FUNCTION IF EXISTS ingredients_record_initial_price();
    DROP TABLE IF EXISTS ingredient_prices;
  `);
};
