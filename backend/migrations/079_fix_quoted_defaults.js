/*
 * Repair six column defaults that were written with their quotes included.
 *
 * Found in Phase 6 while seeding orders for the guest-metrics tests: an INSERT
 * that let `channel` default was rejected by orders_channel_check. The default
 * was not `dining` — it was `'dining'`, apostrophes and all, seven characters
 * that match nothing.
 *
 * The cause is node-pg-migrate's column shorthand. `default: "'dining'"` is
 * already a quoted SQL literal; the builder quoted it a second time, so the
 * stored default became '''dining'''. Every affected column was declared that
 * way, and the pattern is easy to grep for:
 *
 *   SELECT table_name, column_name, column_default
 *     FROM information_schema.columns
 *    WHERE column_default LIKE '%''''''%';
 *
 * Nothing in the application hit this, because every INSERT path names these
 * columns explicitly — which is exactly why it survived seventy-eight
 * migrations. It is still worth fixing, and the three without a CHECK
 * constraint are the reason:
 *
 *   orders.status, orders.channel, payments.status  → a CHECK rejects the
 *     bad default, so an omitting INSERT fails loudly and gets fixed.
 *   recipes.yield_unit, cost_snapshots.triggered_by, tables.status → no
 *     constraint covers them, so an omitting INSERT would have SUCCEEDED and
 *     stored a value with quotes baked in, to be discovered later by a report
 *     that quietly grouped 'piece' apart from piece.
 *
 * Existing rows are not touched: they were all written with explicit values, so
 * there is nothing corrupt to repair — only the default itself. The check below
 * asserts that rather than assuming it.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE orders         ALTER COLUMN status       SET DEFAULT 'open';
    ALTER TABLE orders         ALTER COLUMN channel      SET DEFAULT 'dining';
    ALTER TABLE payments       ALTER COLUMN status       SET DEFAULT 'pending';
    ALTER TABLE tables         ALTER COLUMN status       SET DEFAULT 'available';
    ALTER TABLE recipes        ALTER COLUMN yield_unit   SET DEFAULT 'piece';
    ALTER TABLE cost_snapshots ALTER COLUMN triggered_by SET DEFAULT 'MANUAL';
  `);

  // If any row DID slip through with a quoted value, say so loudly here rather
  // than leaving it to be found by whoever is confused by the report later.
  pgm.sql(`
    DO $$
    DECLARE bad INTEGER;
    BEGIN
      SELECT
        (SELECT COUNT(*) FROM orders         WHERE status       LIKE '''%')
      + (SELECT COUNT(*) FROM orders         WHERE channel      LIKE '''%')
      + (SELECT COUNT(*) FROM payments       WHERE status       LIKE '''%')
      + (SELECT COUNT(*) FROM tables         WHERE status       LIKE '''%')
      + (SELECT COUNT(*) FROM recipes        WHERE yield_unit   LIKE '''%')
      + (SELECT COUNT(*) FROM cost_snapshots WHERE triggered_by LIKE '''%')
      INTO bad;

      IF bad > 0 THEN
        RAISE WARNING
          'Found % row(s) storing a quoted default value. Fix them before relying on any '
          'report that groups by these columns.', bad;
      END IF;
    END $$;
  `);
};

exports.down = () => {
  // Deliberately not reversed. The previous state was a broken default that no
  // deployment wants back, and restoring it would re-arm the silent-corruption
  // case above. Nothing depends on these defaults being wrong.
};
