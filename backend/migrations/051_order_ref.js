exports.up = (pgm) => {
  // Sequential counter per restaurant per calendar month
  pgm.createTable('order_counters', {
    restaurant_id: { type: 'uuid', notNull: true, references: '"restaurants"', onDelete: 'CASCADE' },
    year_month:    { type: 'char(4)', notNull: true },   // e.g. '2502'
    seq:           { type: 'integer', notNull: true, default: 0 },
  });
  pgm.addConstraint('order_counters', 'order_counters_pkey', 'PRIMARY KEY (restaurant_id, year_month)');

  // Human-readable reference, e.g. '2502A029'
  pgm.addColumn('orders', {
    order_ref: { type: 'varchar(10)' },
  });

  // Unique per restaurant so references don't collide across tenants
  pgm.createIndex('orders', ['restaurant_id', 'order_ref'], {
    unique: true,
    where: 'order_ref IS NOT NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('orders', ['restaurant_id', 'order_ref']);
  pgm.dropColumn('orders', 'order_ref');
  pgm.dropTable('order_counters');
};
