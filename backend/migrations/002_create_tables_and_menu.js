exports.up = pgm => {
  pgm.createTable('tables', {
    id:     { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    number: { type: 'integer', notNull: true, unique: true },
    status: { type: 'varchar(50)', notNull: true, default: "'available'" },
    seats:  { type: 'integer', notNull: true },
  });

  pgm.createTable('menu_items', {
    id:        { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name:      { type: 'varchar(255)', notNull: true },
    price:     { type: 'numeric(10,2)', notNull: true },
    category:  { type: 'varchar(100)' },
    available: { type: 'boolean', default: true },
  });
};

exports.down = pgm => {
  pgm.dropTable('menu_items');
  pgm.dropTable('tables');
};
