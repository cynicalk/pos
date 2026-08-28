/**
 * Per-ingredient nutrition — the data the Nutrition Assistant was a shell for.
 *
 * The POS has always held recipes (which ingredient, how much per serving) but
 * never what a kilo of chicken or a litre of milk is worth nutritionally. These
 * four columns close that gap at the only place the fact belongs: the ingredient
 * itself. A dish's per-serving nutrition is then the same recipe explosion the
 * prep sheet already does for cost — pure arithmetic, fully traceable.
 *
 * Values are per the ingredient's own `unit` (kg / L / pcs), matching how
 * `latest_unit_cost` is already carried, so a recipe line's `quantity` multiplies
 * straight through without a unit-conversion layer this deployment can't feed.
 *
 * Nullable on purpose: an ingredient nobody has entered nutrition for stays NULL,
 * and modules/menu/nutrition.js treats a dish with even one undeclared ingredient
 * as *incomplete* rather than reporting a number that is nearly right — the same
 * "don't claim what we can't establish" rule the dietary verdicts follow.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS kcal_per_unit      numeric(10,3);
    ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS protein_g_per_unit numeric(10,3);
    ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS carbs_g_per_unit   numeric(10,3);
    ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS fat_g_per_unit     numeric(10,3);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE ingredients DROP COLUMN IF EXISTS kcal_per_unit;
    ALTER TABLE ingredients DROP COLUMN IF EXISTS protein_g_per_unit;
    ALTER TABLE ingredients DROP COLUMN IF EXISTS carbs_g_per_unit;
    ALTER TABLE ingredients DROP COLUMN IF EXISTS fat_g_per_unit;
  `);
};
