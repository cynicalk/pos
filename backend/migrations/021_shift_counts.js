exports.up = (pgm) => {
  pgm.createTable('shift_counts', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    restaurant_id: { type: 'uuid', notNull: true, references: 'restaurants', onDelete: 'CASCADE' },
    counted_by:    { type: 'uuid', references: 'users' },
    counted_at:    { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expected_cash: { type: 'numeric(12,4)', notNull: true },
    actual_cash:   { type: 'numeric(12,4)', notNull: true },
    variance:      { type: 'numeric(12,4)', notNull: true },
    notes:         { type: 'text' },
    denominations: { type: 'jsonb' },
  });
  pgm.addIndex('shift_counts', ['restaurant_id', 'counted_at']);
};

exports.down = (pgm) => pgm.dropTable('shift_counts');
