// Physical stock counts (stocktakes). These supply the independently-measured
// "actual" usage the food-cost variance report needs: because stock_on_hand is
// recipe-deducted on every sale, the ledger's usage equals the theoretical
// figure by construction, so a real count is the only source of true actual
// consumption (actual usage = opening count + purchases − closing count).

exports.up = (pgm) => {
  pgm.createTable('stock_counts', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    restaurant_id: { type: 'uuid', notNull: true, references: '"restaurants"', onDelete: 'CASCADE' },
    label:         { type: 'varchar(120)', notNull: true },
    status:        { type: 'varchar(20)', notNull: true, default: 'open' }, // 'open' | 'finalized'
    counted_at:    { type: 'timestamptz' },                                   // set on finalize
    created_by:    { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    notes:         { type: 'text' },
    created_at:    { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('stock_counts', ['restaurant_id', 'status', 'counted_at']);

  pgm.createTable('stock_count_lines', {
    id:             { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    stock_count_id: { type: 'uuid', notNull: true, references: '"stock_counts"', onDelete: 'CASCADE' },
    ingredient_id:  { type: 'uuid', notNull: true, references: '"ingredients"', onDelete: 'RESTRICT' },
    counted_qty:    { type: 'numeric(12,3)' },                                 // null until counted
    system_qty:     { type: 'numeric(12,3)' },                                 // stock_on_hand snapshot
    unit:           { type: 'varchar(20)', notNull: true },
  });
  pgm.addConstraint('stock_count_lines', 'scl_count_ingredient_unique', 'UNIQUE (stock_count_id, ingredient_id)');
};

exports.down = (pgm) => {
  pgm.dropTable('stock_count_lines');
  pgm.dropTable('stock_counts');
};
