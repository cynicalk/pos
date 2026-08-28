/*
 * backfill-nutrition — give the demo ingredients real per-unit macros.
 *
 * The Nutrition Assistant derives a dish's per-serving figure by exploding its
 * recipe through each ingredient's declared nutrition (modules/menu/nutrition).
 * The seed carries recipes but no nutrition, so every dish reads "undeclared".
 * This loads reference per-unit values so the screen — and the guest menu card —
 * light up with real, traceable numbers instead of a model's guess.
 *
 * Values are per the ingredient's own unit: kcal / protein(g) / carbs(g) / fat(g)
 * per kg, per L, or per piece. They are ordinary food-composition reference
 * figures, not measured for this kitchen — good enough for a demo, and the point
 * of the feature is that the arithmetic on top is honest and explainable.
 *
 * A handful of ingredients are LEFT undeclared on purpose (a house spice blend, a
 * sauce, a wrapper, a veg mix) so coverage lands below 100% and the screen
 * demonstrates its honest third state — a dish with one undeclared ingredient
 * reporting nothing rather than a number that is nearly right.
 *
 * Idempotent: re-running sets the same values. Demo-data only.
 *
 * Usage: node scripts/backfill-nutrition.js [restaurantId]
 */
const db = require('../src/shared/db');

// name → [kcal, protein_g, carbs_g, fat_g] per the ingredient's unit.
const NUTRITION = {
  'All-Purpose Flour': [3640, 100, 760, 10],
  'Basmati Rice':      [3600, 75, 800, 6],
  'Black Lentils':     [3400, 250, 600, 10],
  'Bread Loaf':        [80, 2.7, 15, 1],      // per slice (recipes use it by the piece)
  'Burger Bun':        [250, 9, 45, 4],       // per bun
  'Butter':            [7170, 8, 0, 810],
  'Calamari':          [920, 154, 30, 14],
  'Chicken':           [2390, 270, 0, 140],
  'Chicken Breast':    [1650, 310, 0, 36],
  'Coffee':            [1200, 130, 400, 20],  // ground; used in grams
  'Condensed Milk':    [3210, 78, 543, 87],
  'Cooking Cream':     [1950, 26, 30, 200],
  'Dark Chocolate':    [5460, 76, 460, 380],
  'Eggs':              [78, 6.3, 0.6, 5.3],   // per egg
  'Fish Fillet':       [2060, 220, 0, 120],
  'Garlic':            [1490, 64, 330, 5],
  'Heavy Cream':       [3400, 20, 28, 360],
  'Mango Pulp':        [600, 5, 150, 3],
  'Milk':              [600, 32, 48, 33],
  'Mozzarella Cheese': [2800, 220, 22, 220],
  'Noodles':           [1400, 50, 250, 20],
  'Onions':            [400, 11, 93, 1],
  'Oranges':           [470, 9, 118, 1],
  'Paneer':            [2960, 180, 34, 220],
  'Pasta':             [3710, 130, 750, 15],
  'Pizza Dough':       [660, 22, 130, 6],     // per base
  'Potatoes':          [770, 20, 170, 1],
  'Strawberry Puree':  [400, 7, 90, 3],
  'Sugar':             [3870, 0, 1000, 0],
  'Tea Leaves':        [1000, 200, 400, 25],  // dry; used in grams
  'Tomatoes':          [180, 9, 39, 2],
  'Yogurt':            [610, 35, 47, 33],
  // Deliberately undeclared: 'Spice Blend', 'BBQ Sauce',
  // 'Spring Roll Wrappers', 'Vegetable Mix' — so coverage stays honest.
};

async function main() {
  const restaurantId = process.argv[2] || (await db.query(
    `SELECT id FROM restaurants WHERE name = 'Demo Restaurant' LIMIT 1`,
  )).rows[0]?.id;
  if (!restaurantId) throw new Error('No restaurant id given and no "Demo Restaurant" found');

  const { rows: ingredients } = await db.query(
    `SELECT id, name FROM ingredients WHERE restaurant_id = $1 AND is_active = true`,
    [restaurantId],
  );

  let declared = 0;
  const skipped = [];
  for (const ing of ingredients) {
    const n = NUTRITION[ing.name];
    if (!n) { skipped.push(ing.name); continue; }
    await db.query(
      `UPDATE ingredients
          SET kcal_per_unit = $2, protein_g_per_unit = $3,
              carbs_g_per_unit = $4, fat_g_per_unit = $5
        WHERE id = $1`,
      [ing.id, n[0], n[1], n[2], n[3]],
    );
    declared += 1;
  }

  console.log(`Nutrition set on ${declared} of ${ingredients.length} ingredients.`);
  if (skipped.length) console.log('Left undeclared (honest gap):', skipped.join(', '));
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });
