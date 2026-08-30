/**
 * Prep logs — the one number the waste picture was missing: how much of each
 * dish was actually made for a service.
 *
 * The POS has always known what SOLD (order_items) and what was BINNED
 * (waste_logs, which already carries an OVERPREP reason). What it never recorded
 * is what was PREPPED, so it could log the waste but never score the prep
 * decision. This table closes that, at the grain the kitchen thinks in — dish
 * portions per trading day — with two capture points:
 *
 *   - planned_qty : pre-service, the chef confirms or nudges the prep sheet's
 *                   forecast. Low-friction, rides a screen already opened.
 *   - actual_qty  : post-service, what was really made. More accurate; optional,
 *                   so a kitchen that only plans still gets a reconciliation.
 *
 * forecast_qty is snapshotted when the plan is set, so later we can ask a
 * separate question — did they prep to the forecast, and did the forecast hold.
 * Reconciliation prefers actual over planned and says which it used; a dish with
 * no log at all reads "not logged", never "prepped zero".
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE prep_logs (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      menu_item_id    UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
      menu_item_name  TEXT NOT NULL,
      service_date    DATE NOT NULL,
      forecast_qty    NUMERIC(10,2),
      planned_qty     NUMERIC(10,2),
      actual_qty      NUMERIC(10,2),
      planned_by      UUID REFERENCES users(id) ON DELETE SET NULL,
      planned_at      TIMESTAMPTZ,
      actual_by       UUID REFERENCES users(id) ON DELETE SET NULL,
      actual_at       TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (restaurant_id, menu_item_id, service_date)
    );
    CREATE INDEX idx_prep_logs_lookup ON prep_logs (restaurant_id, service_date);
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS prep_logs;');
};
