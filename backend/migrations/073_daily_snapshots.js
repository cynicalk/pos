/*
 * 073_daily_snapshots
 *
 * One row per restaurant per trading day — the forecasting family's raw
 * material, ported from the ops back-office (DailySnapshot). Phase 0 of the
 * merge; see MERGE_PLAN.md §4.
 *
 * Forecasts are deliberately NOT built here. Training a demand model on two
 * weeks of thin data is fabrication with extra steps. This table starts the
 * clock, and the `collecting` state of the Phase 1 shells reads its row count
 * so the wait is visible and honest rather than a dead screen.
 *
 * `snapshot_date` is the restaurant's LOCAL trading day, not a UTC one. In IST
 * a UTC-bounded day runs 05:30-05:30, which splits one dinner service across
 * two rows — the post-midnight orders land on the previous day. A restaurant's
 * Monday is Monday where the restaurant is, and revenue attributed to the wrong
 * trading day is exactly the sort of quiet error a forecast would faithfully
 * learn. The collector resolves the zone from settings.timezone.
 *
 * `timezone` records which zone produced the row. If an operator later corrects
 * that setting, old rows stay interpretable instead of silently becoming
 * incomparable with new ones.
 *
 * Columns the ops app had that are deliberately ABSENT:
 *   total_payout / payout_variance — aggregator settlement data. Nothing in POS
 *     produces it, so the column would hold 0.00 on every row, which reads as
 *     "you were paid nothing" rather than "unknown". Added in Phase 8 with the
 *     payouts work, when there is a real source.
 *   search_ranks — manual entry, arrives in Phase 6.
 * A zero that means "no data" is the most expensive kind of wrong number in a
 * table whose whole purpose is to be trained on later.
 *
 * avg_rating is nullable for the same reason: a day with no reviews stores
 * NULL, never 0.00.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS daily_snapshots (
      id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id    UUID           NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      snapshot_date    DATE           NOT NULL,
      timezone         VARCHAR(64)    NOT NULL,
      total_orders     INTEGER        NOT NULL DEFAULT 0,
      total_revenue    NUMERIC(12,2)  NOT NULL DEFAULT 0,
      avg_order_value  NUMERIC(10,2)  NOT NULL DEFAULT 0,
      cancelled_orders INTEGER        NOT NULL DEFAULT 0,
      review_count     INTEGER        NOT NULL DEFAULT 0,
      avg_rating       NUMERIC(3,2),
      -- Item-level sales for the day as {itemName: qty}. The forecasting family
      -- trains per item, so the aggregate totals above are not enough on their own.
      item_sales       JSONB          NOT NULL DEFAULT '{}'::jsonb,
      created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),

      UNIQUE (restaurant_id, snapshot_date)
    );

    -- History scans are always "this restaurant, in date order".
    CREATE INDEX IF NOT EXISTS daily_snapshots_restaurant_date_idx
      ON daily_snapshots (restaurant_id, snapshot_date DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS daily_snapshots_restaurant_date_idx;
    DROP TABLE IF EXISTS daily_snapshots;
  `);
};
