exports.up = pgm => {
  pgm.createTable('orders', {
    id:         { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    table_id:   { type: 'uuid', references: 'tables', notNull: true },
    status:     { type: 'varchar(50)', notNull: true, default: "'open'" },
    created_by: { type: 'uuid', references: 'users' },
    created_at: { type: 'timestamp', default: pgm.func('now()') },
  });

  pgm.createTable('order_items', {
    id:           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    order_id:     { type: 'uuid', references: 'orders', notNull: true },
    menu_item_id: { type: 'uuid', references: 'menu_items', notNull: true },
    quantity:     { type: 'integer', notNull: true },
    notes:        { type: 'text' },
  });

  pgm.createTable('payments', {
    id:         { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    order_id:   { type: 'uuid', references: 'orders', notNull: true },
    amount:     { type: 'numeric(10,2)', notNull: true },
    method:     { type: 'varchar(50)', notNull: true },
    status:     { type: 'varchar(50)', notNull: true, default: "'pending'" },
    created_at: { type: 'timestamp', default: pgm.func('now()') },
  });
};

exports.down = pgm => {
  pgm.dropTable('payments');
  pgm.dropTable('order_items');
  pgm.dropTable('orders');
};
