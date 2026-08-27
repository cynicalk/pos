exports.up = (pgm) => {
  pgm.createTable('ingredients', {
    id:               { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    restaurant_id:    { type: 'uuid', notNull: true },
    name:             { type: 'varchar(200)', notNull: true },
    unit:             { type: 'varchar(20)', notNull: true },
    stock_on_hand:    { type: 'numeric(12,3)', notNull: true, default: 0 },
    reorder_level:    { type: 'numeric(12,3)', notNull: true, default: 0 },
    reorder_qty:      { type: 'numeric(12,3)', notNull: true, default: 0 },
    latest_unit_cost: { type: 'numeric(10,4)', notNull: true, default: 0 },
    is_active:        { type: 'boolean', notNull: true, default: true },
  });
  pgm.createIndex('ingredients', ['restaurant_id']);

  pgm.createTable('recipes', {
    id:             { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    restaurant_id:  { type: 'uuid', notNull: true },
    name:           { type: 'varchar(200)', notNull: true },
    yield_quantity: { type: 'numeric(8,3)', notNull: true, default: 1 },
    yield_unit:     { type: 'varchar(20)', notNull: true, default: "'piece'" },
    prep_time_sec:  { type: 'integer' },
    notes:          { type: 'text' },
    updated_at:     { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('recipes', ['restaurant_id']);

  pgm.createTable('recipe_ingredients', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    recipe_id:     { type: 'uuid', notNull: true, references: '"recipes"', onDelete: 'CASCADE' },
    ingredient_id: { type: 'uuid', notNull: true, references: '"ingredients"', onDelete: 'RESTRICT' },
    quantity:      { type: 'numeric(10,4)', notNull: true },
    unit:          { type: 'varchar(20)', notNull: true },
    cost_per_unit: { type: 'numeric(10,4)', notNull: true, default: 0 },
  });
  pgm.addConstraint('recipe_ingredients', 'ri_recipe_ingredient_unique', 'UNIQUE (recipe_id, ingredient_id)');

  pgm.addColumn('menu_items', {
    recipe_id: { type: 'uuid', references: '"recipes"', onDelete: 'SET NULL' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('menu_items', 'recipe_id');
  pgm.dropTable('recipe_ingredients');
  pgm.dropTable('recipes');
  pgm.dropTable('ingredients');
};
