/*
 * 059_inventory_restaurant_fks
 *
 * Migrations 026–030 created the inventory / recipe tables with a bare
 * `restaurant_id uuid NOT NULL` and — unlike every other tenant-scoped table —
 * no foreign key to `restaurants`. That left two gaps:
 *   • a row could carry a restaurant_id that doesn't reference a real
 *     restaurant, and
 *   • hard-deleting a restaurant orphaned its inventory/recipe rows instead of
 *     cascading them away.
 *
 * This adds the missing `restaurant_id` FKs (ON DELETE CASCADE) to the seven
 * affected tables, bringing them in line with the rest of the schema.
 *
 * Cascade interaction — why the RESTRICT FKs are relaxed:
 * Four FKs were created ON DELETE RESTRICT (three referencing `ingredients`,
 * one — combo_items.menu_item_id — referencing `menu_items`). Once a restaurant
 * delete cascades into `ingredients` / `combo_meals`, those RESTRICT FKs still
 * see referencing rows in the same statement, and RESTRICT is *not* deferrable,
 * so it would block the delete. (combo_items already blocks restaurant deletion
 * today for any tenant that has combos.) They are relaxed to NO ACTION, which
 * is identical for ordinary single-row deletes — you still cannot delete an
 * ingredient or menu item that is referenced — but is deferrable, so a full
 * tenant delete, where the referencing rows are removed in the same statement,
 * passes the end-of-statement check.
 *
 * Safety: this refuses to run if any orphaned rows already exist (their
 * restaurant is gone), because the ADD CONSTRAINT would otherwise fail partway.
 * If it trips, clean those rows up deliberately and re-run — rather than have a
 * migration silently delete data.
 */

// Tenant tables missing a restaurant_id -> restaurants FK (migrations 026–030).
const TENANT_TABLES = [
  'ingredients',
  'recipes',
  'combo_meals',
  'modifier_groups',
  'waste_logs',
  'inventory_transactions',
  'cost_snapshots',
];

// FKs created ON DELETE RESTRICT that would block a restaurant-level cascade.
// `def` is the relaxed (NO ACTION) definition; down restores ON DELETE RESTRICT.
const RESTRICT_FKS = [
  { table: 'recipe_ingredients',     name: 'recipe_ingredients_ingredient_id_fkey',     def: 'FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)' },
  { table: 'waste_logs',             name: 'waste_logs_ingredient_id_fkey',             def: 'FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)' },
  { table: 'inventory_transactions', name: 'inventory_transactions_ingredient_id_fkey', def: 'FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)' },
  { table: 'combo_items',            name: 'combo_items_menu_item_id_fkey',             def: 'FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)' },
];

exports.up = (pgm) => {
  // 1. Refuse to run if orphaned rows exist — ADD CONSTRAINT would error otherwise.
  pgm.sql(`
    DO $$
    DECLARE orphans BIGINT;
    BEGIN
      SELECT
        (SELECT count(*) FROM ingredients            x WHERE NOT EXISTS (SELECT 1 FROM restaurants r WHERE r.id = x.restaurant_id)) +
        (SELECT count(*) FROM recipes                x WHERE NOT EXISTS (SELECT 1 FROM restaurants r WHERE r.id = x.restaurant_id)) +
        (SELECT count(*) FROM combo_meals            x WHERE NOT EXISTS (SELECT 1 FROM restaurants r WHERE r.id = x.restaurant_id)) +
        (SELECT count(*) FROM modifier_groups        x WHERE NOT EXISTS (SELECT 1 FROM restaurants r WHERE r.id = x.restaurant_id)) +
        (SELECT count(*) FROM waste_logs             x WHERE NOT EXISTS (SELECT 1 FROM restaurants r WHERE r.id = x.restaurant_id)) +
        (SELECT count(*) FROM inventory_transactions x WHERE NOT EXISTS (SELECT 1 FROM restaurants r WHERE r.id = x.restaurant_id)) +
        (SELECT count(*) FROM cost_snapshots         x WHERE NOT EXISTS (SELECT 1 FROM restaurants r WHERE r.id = x.restaurant_id))
        INTO orphans;
      IF orphans > 0 THEN
        RAISE EXCEPTION
          'Migration 059 aborted: % inventory/recipe row(s) reference a restaurant that no longer exists. Clean up these orphans, then re-run.', orphans;
      END IF;
    END $$;
  `);

  // 2. Relax the RESTRICT FKs to NO ACTION so a tenant delete can cascade
  //    through the inventory/combo subtree. No change for single-row deletes.
  for (const { table, name, def } of RESTRICT_FKS) {
    pgm.dropConstraint(table, name);
    pgm.addConstraint(table, name, def);
  }

  // 3. Add the missing restaurant_id foreign keys (ON DELETE CASCADE), matching
  //    every other tenant-scoped table.
  for (const table of TENANT_TABLES) {
    pgm.addConstraint(table, `${table}_restaurant_id_fkey`,
      'FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE');
  }
};

exports.down = (pgm) => {
  // Drop the added restaurant_id FKs.
  for (const table of TENANT_TABLES) {
    pgm.dropConstraint(table, `${table}_restaurant_id_fkey`);
  }

  // Restore the original ON DELETE RESTRICT behaviour.
  for (const { table, name, def } of RESTRICT_FKS) {
    pgm.dropConstraint(table, name);
    pgm.addConstraint(table, name, `${def} ON DELETE RESTRICT`);
  }
};
