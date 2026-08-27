exports.up = (pgm) => {
  pgm.createTable('waste_logs', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    restaurant_id: { type: 'uuid', notNull: true },
    ingredient_id: { type: 'uuid', notNull: true, references: '"ingredients"', onDelete: 'RESTRICT' },
    quantity:      { type: 'numeric(10,4)', notNull: true },
    unit:          { type: 'varchar(20)', notNull: true },
    reason:        { type: 'varchar(20)', notNull: true },
    cost_at_time:  { type: 'numeric(10,4)', notNull: true, default: 0 },
    total_cost:    { type: 'numeric(10,4)', notNull: true, default: 0 },
    logged_by:     { type: 'uuid' },
    logged_at:     { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    notes:         { type: 'text' },
  });
  pgm.createIndex('waste_logs', ['restaurant_id', 'ingredient_id', 'logged_at']);

  pgm.createTable('inventory_transactions', {
    id:             { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    restaurant_id:  { type: 'uuid', notNull: true },
    ingredient_id:  { type: 'uuid', notNull: true, references: '"ingredients"', onDelete: 'RESTRICT' },
    txn_type:       { type: 'varchar(20)', notNull: true },
    quantity_delta: { type: 'numeric(12,4)', notNull: true },
    ref_id:         { type: 'varchar(100)' },
    unit_cost:      { type: 'numeric(10,4)', notNull: true, default: 0 },
    performed_by:   { type: 'uuid' },
    created_at:     { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('inventory_transactions', ['restaurant_id', 'ingredient_id', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('inventory_transactions');
  pgm.dropTable('waste_logs');
};
