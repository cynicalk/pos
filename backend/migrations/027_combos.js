exports.up = (pgm) => {
  pgm.createTable('combo_meals', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    restaurant_id: { type: 'uuid', notNull: true },
    name:          { type: 'varchar(200)', notNull: true },
    sku:           { type: 'varchar(100)' },
    price:         { type: 'numeric(10,2)', notNull: true },
    is_active:     { type: 'boolean', notNull: true, default: true },
    valid_from:    { type: 'date' },
    valid_until:   { type: 'date' },
  });
  pgm.createIndex('combo_meals', ['restaurant_id']);

  pgm.createTable('combo_items', {
    id:           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    combo_id:     { type: 'uuid', notNull: true, references: '"combo_meals"', onDelete: 'CASCADE' },
    menu_item_id: { type: 'uuid', notNull: true, references: '"menu_items"', onDelete: 'RESTRICT' },
    quantity:     { type: 'integer', notNull: true, default: 1 },
    sort_order:   { type: 'integer', notNull: true, default: 0 },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('combo_items');
  pgm.dropTable('combo_meals');
};
