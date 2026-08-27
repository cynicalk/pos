exports.up = (pgm) => {
  pgm.createTable('cost_snapshots', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    recipe_id:     { type: 'uuid', notNull: true, references: '"recipes"', onDelete: 'CASCADE' },
    restaurant_id: { type: 'uuid', notNull: true },
    total_cost:    { type: 'numeric(10,4)', notNull: true },
    selling_price: { type: 'numeric(10,2)', notNull: true },
    gross_margin:  { type: 'numeric(10,4)' },
    margin_pct:    { type: 'numeric(5,2)' },
    snapped_at:    { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    triggered_by:  { type: 'varchar(50)', notNull: true, default: "'MANUAL'" },
  });
  pgm.createIndex('cost_snapshots', ['restaurant_id', 'recipe_id', 'snapped_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('cost_snapshots');
};
