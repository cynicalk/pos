/*
 * 075_menu_item_created_at
 *
 * When a dish was added to the menu. Required by the New Item Performance
 * Tracker (MERGE_PLAN.md Phase 3), which judges a dish's launch curve against
 * the menu's median daily volume — "new" is meaningless without a launch date,
 * and POS's `menu_items` had no timestamp of any kind.
 *
 * The column is added WITHOUT a default and only then given one, which is the
 * whole point of splitting it into two statements: adding a column with a
 * DEFAULT would backfill every existing row with now(), and the tracker would
 * open showing the operator's entire established menu as freshly launched, each
 * dish "on pace" against a launch date that never happened. Existing rows stay
 * NULL — their real launch date is genuinely unknown — and the tracker skips
 * NULLs rather than guessing. Dishes added from here on get a true one.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
    ALTER TABLE menu_items ALTER COLUMN created_at SET DEFAULT now();

    -- The tracker scans "this restaurant's recently added dishes".
    CREATE INDEX IF NOT EXISTS menu_items_restaurant_created_idx
      ON menu_items (restaurant_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS menu_items_restaurant_created_idx;
    ALTER TABLE menu_items DROP COLUMN IF EXISTS created_at;
  `);
};
