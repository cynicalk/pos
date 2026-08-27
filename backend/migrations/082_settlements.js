/*
 * Phase 8 — settlement reconciliation (MERGE_PLAN.md).
 *
 * Tier 2: the parser and the reconciliation are built and tested against a
 * fixture; the screen ships empty until a real settlement file lands. That is
 * the whole point of the tier — the machinery is ready and demonstrably
 * correct, and nothing on screen pretends to have data it does not have.
 *
 * `platform_contracts` exists so the commission check has somewhere to read a
 * rate the OPERATOR entered from their signed contract. It cannot be derived
 * from a settlement file: the file shows what was charged, which is precisely
 * the thing in question. With no row here the check abstains rather than
 * assuming an industry-standard rate and generating confident disputes about
 * money.
 *
 * `settlement_orders` keeps every parsed row rather than only the totals, so a
 * disputed figure can be traced back to the order it came from. A reconciliation
 * an operator cannot take to the platform line by line is not worth running.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS platform_contracts (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      platform       TEXT NOT NULL CHECK (platform IN ('swiggy','zomato')),
      -- Stored as a fraction (0.2200 = 22%). CHECK excludes 0 and 1: a zero
      -- commission contract does not exist, and a rate of 1 is a typo for 1%
      -- that would otherwise expect the platform to keep everything.
      commission_rate NUMERIC(5,4)
        CHECK (commission_rate IS NULL OR (commission_rate > 0 AND commission_rate < 1)),
      updated_by     UUID REFERENCES users(id) ON DELETE SET NULL,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (restaurant_id, platform)
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      platform       TEXT NOT NULL CHECK (platform IN ('swiggy','zomato')),
      file_name      TEXT NOT NULL,
      -- Nullable: an import whose every row was unreadable has no period, and
      -- the parser refuses to invent one from today's date.
      period_start   DATE,
      period_end     DATE,
      gross_sales    NUMERIC(12,2) NOT NULL DEFAULT 0,
      commission     NUMERIC(12,2) NOT NULL DEFAULT 0,
      tds            NUMERIC(12,2) NOT NULL DEFAULT 0,
      tcs            NUMERIC(12,2) NOT NULL DEFAULT 0,
      penalties      NUMERIC(12,2) NOT NULL DEFAULT 0,
      discounts      NUMERIC(12,2) NOT NULL DEFAULT 0,
      refunds        NUMERIC(12,2) NOT NULL DEFAULT 0,
      net_payout     NUMERIC(12,2) NOT NULL DEFAULT 0,
      -- What reconciliation could actually establish, never a projection.
      recoverable    NUMERIC(12,2) NOT NULL DEFAULT 0,
      rows_read      INTEGER NOT NULL DEFAULT 0,
      -- Carried permanently, not just reported at import time: every total
      -- above describes only the rows we understood, and whoever reads this
      -- settlement in six months needs to know how many we did not.
      rows_rejected  INTEGER NOT NULL DEFAULT 0,
      findings       JSONB NOT NULL DEFAULT '[]'::jsonb,
      uploaded_by    UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS settlements_restaurant_idx
      ON settlements (restaurant_id, period_start DESC NULLS LAST);

    CREATE TABLE IF NOT EXISTS settlement_orders (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      settlement_id     UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      restaurant_id     UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      platform_order_id TEXT NOT NULL,
      order_date        DATE NOT NULL,
      gross_amount      NUMERIC(10,2) NOT NULL,
      commission        NUMERIC(10,2) NOT NULL DEFAULT 0,
      tds               NUMERIC(10,2) NOT NULL DEFAULT 0,
      tcs               NUMERIC(10,2) NOT NULL DEFAULT 0,
      sla_penalty       NUMERIC(10,2) NOT NULL DEFAULT 0,
      discount_restaurant NUMERIC(10,2) NOT NULL DEFAULT 0,
      discount_platform NUMERIC(10,2) NOT NULL DEFAULT 0,
      refund_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
      net_amount        NUMERIC(10,2) NOT NULL,
      status            TEXT NOT NULL DEFAULT 'delivered'
        CHECK (status IN ('delivered','cancelled','refunded')),
      -- Signed: positive means we were paid less than this row's own numbers
      -- say. One convention everywhere, so a total never has to be reasoned
      -- about twice.
      variance          NUMERIC(10,2) NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS settlement_orders_settlement_idx
      ON settlement_orders (settlement_id);

    -- Re-importing the same file must not double-count. The platform's own
    -- order id is the natural key, and it is unique per restaurant and platform
    -- rather than globally: two platforms can independently issue "10023".
    CREATE UNIQUE INDEX IF NOT EXISTS settlement_orders_unique_idx
      ON settlement_orders (restaurant_id, platform_order_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS settlement_orders;
    DROP TABLE IF EXISTS settlements;
    DROP TABLE IF EXISTS platform_contracts;
  `);
};
