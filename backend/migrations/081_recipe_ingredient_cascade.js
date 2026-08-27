/*
 * Make recipe_ingredients.ingredient_id cascade, so deleting a tenant works.
 *
 * Found in Phase 7 while tearing down the guest-menu tests. Deleting a
 * restaurant that has even one costed recipe fails outright:
 *
 *   update or delete on table "ingredients" violates foreign key constraint
 *   "recipe_ingredients_ingredient_id_fkey" on table "recipe_ingredients"
 *
 * `restaurants` cascades to both `recipes` and `ingredients`. Deleting a recipe
 * cascades to its recipe_ingredients rows, but Postgres does not promise to
 * process the recipes branch before the ingredients branch — and in practice it
 * does not. The ingredient delete arrives while its recipe lines still exist and
 * the NO ACTION rule refuses it.
 *
 * This is not theoretical: DELETE /api/admin/restaurants/:id goes straight to
 * repo.deleteRestaurant, which is that exact statement. Reproduced against a
 * throwaway tenant before writing this migration.
 *
 * Why CASCADE is the safe fix rather than a wider change:
 *
 *   The worry with CASCADE here is that deleting one ingredient would silently
 *   strip it out of every recipe using it, leaving costings quietly wrong. That
 *   cannot happen through the application — nothing hard-deletes an ingredient.
 *   ingredients.repository has no DELETE at all; removal is `is_active = false`,
 *   a soft delete that leaves recipe lines intact by design.
 *
 *   So the NO ACTION rule was never protecting a path anyone uses. Its only
 *   observable effect was breaking tenant deletion. If a hard ingredient delete
 *   is ever added, it should refuse at the service layer with a message naming
 *   the recipes involved — a foreign key error surfacing as a 500 was never
 *   that protection either.
 *
 * recipe_id already cascades; this brings the two halves of the row in line.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE recipe_ingredients
      DROP CONSTRAINT IF EXISTS recipe_ingredients_ingredient_id_fkey;

    ALTER TABLE recipe_ingredients
      ADD CONSTRAINT recipe_ingredients_ingredient_id_fkey
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE recipe_ingredients
      DROP CONSTRAINT IF EXISTS recipe_ingredients_ingredient_id_fkey;

    ALTER TABLE recipe_ingredients
      ADD CONSTRAINT recipe_ingredients_ingredient_id_fkey
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id);
  `);
};
