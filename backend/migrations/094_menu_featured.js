/**
 * `featured` on menu items — the operator's lever over the recommender.
 *
 * Phase 0's reco→margin loop can now show that the recommender fills carts with
 * plough-horses (popular but thin) while high-margin puzzles go unseen. This flag
 * closes that loop into an action: an operator marks the dishes they want pushed,
 * and the group recommender boosts them (a `featured` feature in its linear
 * model). The same funnel then measures whether featuring actually moved the
 * dish's impressions and adds — find the leak, pull a lever, watch the number.
 *
 * A plain boolean, defaulting false, so nothing is featured until an operator
 * chooses it. It rides the existing menu-item update path and surfaces in the
 * guest menu payload the recommender reads.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE menu_items ADD COLUMN featured BOOLEAN NOT NULL DEFAULT false;
    CREATE INDEX idx_menu_items_featured ON menu_items (restaurant_id) WHERE featured = true;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_menu_items_featured;
    ALTER TABLE menu_items DROP COLUMN IF EXISTS featured;
  `);
};
