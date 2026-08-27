const DEFAULT_RESTAURANT_ID = '00000000-0000-0000-0000-000000000001';

exports.up = (pgm) => {
  // 1. Create restaurants table
  pgm.createTable('restaurants', {
    id:         { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name:       { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
  });

  // 2. Seed a default restaurant so all existing rows can be backfilled
  pgm.sql(`
    INSERT INTO restaurants (id, name)
    VALUES ('${DEFAULT_RESTAURANT_ID}', 'Default Restaurant');
  `);

  // 3. Add nullable restaurant_id FK to every tenant-scoped table
  for (const table of ['users', 'menu_items', 'tables', 'orders']) {
    pgm.addColumn(table, {
      restaurant_id: { type: 'uuid', references: 'restaurants', onDelete: 'CASCADE' },
    });
  }

  // 4. Backfill all pre-existing rows
  pgm.sql(`
    UPDATE users       SET restaurant_id = '${DEFAULT_RESTAURANT_ID}';
    UPDATE menu_items  SET restaurant_id = '${DEFAULT_RESTAURANT_ID}';
    UPDATE tables      SET restaurant_id = '${DEFAULT_RESTAURANT_ID}';
    UPDATE orders      SET restaurant_id = '${DEFAULT_RESTAURANT_ID}';
  `);

  // 5. Tighten to NOT NULL now that every row has a value
  for (const table of ['users', 'menu_items', 'tables', 'orders']) {
    pgm.alterColumn(table, 'restaurant_id', { notNull: true });
  }

  // 6. Add indexes for the tenant filter (improves every scoped query)
  for (const table of ['users', 'menu_items', 'tables', 'orders']) {
    pgm.createIndex(table, 'restaurant_id');
  }

  // 7. tables.number must only be unique within a restaurant, not globally
  pgm.sql(`ALTER TABLE tables DROP CONSTRAINT tables_number_key;`);
  pgm.addConstraint('tables', 'tables_restaurant_id_number_key', 'UNIQUE (restaurant_id, number)');

  // 8. Migrate settings: change PK from (key) to (restaurant_id, key)
  pgm.sql(`ALTER TABLE settings DROP CONSTRAINT settings_pkey;`);
  pgm.addColumn('settings', {
    restaurant_id: { type: 'uuid', references: 'restaurants', onDelete: 'CASCADE' },
  });
  pgm.sql(`UPDATE settings SET restaurant_id = '${DEFAULT_RESTAURANT_ID}';`);
  pgm.alterColumn('settings', 'restaurant_id', { notNull: true });
  pgm.sql(`ALTER TABLE settings ADD PRIMARY KEY (restaurant_id, key);`);
};

exports.down = (pgm) => {
  // Reverse settings PK
  pgm.sql(`
    ALTER TABLE settings DROP CONSTRAINT settings_pkey;
    ALTER TABLE settings DROP COLUMN restaurant_id;
    ALTER TABLE settings ADD PRIMARY KEY (key);
  `);

  // Restore tables unique constraint
  pgm.dropConstraint('tables', 'tables_restaurant_id_number_key');
  pgm.sql(`ALTER TABLE tables ADD CONSTRAINT tables_number_key UNIQUE (number);`);

  // Drop indexes
  for (const table of ['users', 'menu_items', 'tables', 'orders']) {
    pgm.dropIndex(table, 'restaurant_id');
  }

  // Drop restaurant_id columns
  for (const table of ['orders', 'tables', 'menu_items', 'users']) {
    pgm.dropColumn(table, 'restaurant_id');
  }

  pgm.dropTable('restaurants');
};
