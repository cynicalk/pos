// DB3 + DB2: add missing hot-path FK indexes and CHECK constraints for the
// enum-like status/channel/reason/role columns that were previously validated
// only in application code.
//
// CHECKs are added NOT VALID so the migration can't fail on any pre-existing row;
// they are enforced on every INSERT/UPDATE from now on. (payments.method is left
// unconstrained on purpose — it can be a multi-tender value like 'cash+card'.)

exports.up = (pgm) => {
  // DB3 — hot FK join columns (order_items had only its PK index; payments only PK).
  // inventory_transactions(ingredient_id) is already covered by an existing
  // (restaurant_id, ingredient_id, created_at) composite index.
  pgm.createIndex('order_items', 'order_id');
  pgm.createIndex('order_items', 'menu_item_id');
  pgm.createIndex('payments', 'order_id');

  // DB2 — enum CHECK constraints (NOT VALID), mirroring the app's allowed values.
  pgm.sql(`
    ALTER TABLE orders      ADD CONSTRAINT orders_status_check
      CHECK (status IN ('open','received','preparing','ready','served','paid','cancelled')) NOT VALID;
    ALTER TABLE orders      ADD CONSTRAINT orders_channel_check
      CHECK (channel IN ('dining','takeaway','delivery')) NOT VALID;
    ALTER TABLE order_items ADD CONSTRAINT order_items_status_check
      CHECK (status IN ('pending','preparing','ready','served','cancelled')) NOT VALID;
    ALTER TABLE payments    ADD CONSTRAINT payments_status_check
      CHECK (status IN ('pending','completed')) NOT VALID;
    ALTER TABLE waste_logs  ADD CONSTRAINT waste_logs_reason_check
      CHECK (reason IN ('SPOILAGE','SPILL','OVERPREP','DAMAGED','OTHER')) NOT VALID;
    ALTER TABLE users       ADD CONSTRAINT users_role_check
      CHECK (role IN ('admin','staff','cashier','kitchen')) NOT VALID;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE orders      DROP CONSTRAINT IF EXISTS orders_status_check;
    ALTER TABLE orders      DROP CONSTRAINT IF EXISTS orders_channel_check;
    ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_status_check;
    ALTER TABLE payments    DROP CONSTRAINT IF EXISTS payments_status_check;
    ALTER TABLE waste_logs  DROP CONSTRAINT IF EXISTS waste_logs_reason_check;
    ALTER TABLE users       DROP CONSTRAINT IF EXISTS users_role_check;
  `);
  pgm.dropIndex('payments', 'order_id');
  pgm.dropIndex('order_items', 'menu_item_id');
  pgm.dropIndex('order_items', 'order_id');
};
