exports.up = (pgm) => {
  pgm.createTable('wastage_reviews', {
    id:             { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    restaurant_id:  { type: 'uuid', notNull: true, references: '"restaurants"', onDelete: 'CASCADE' },
    order_id:       { type: 'uuid', notNull: true },
    order_item_id:  { type: 'uuid', notNull: true },
    menu_item_id:   { type: 'uuid', notNull: true },
    menu_item_name: { type: 'text', notNull: true },
    quantity:       { type: 'numeric(10,4)', notNull: true },
    cancel_reason:  { type: 'text' },
    // Snapshot: [{ingredient_id, ingredient_name, unit, unit_cost, default_qty, wasted_qty, returned_qty}]
    ingredients:    { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    status:         { type: 'varchar(20)', notNull: true, default: 'pending' },
    reviewed_by:    { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    reviewed_at:    { type: 'timestamptz' },
    created_at:     { type: 'timestamptz', notNull: true, default: 'NOW()' },
  });

  pgm.createIndex('wastage_reviews', ['restaurant_id', 'status', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('wastage_reviews');
};
