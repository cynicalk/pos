exports.up = (pgm) => {
  pgm.createTable('modifier_groups', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    restaurant_id: { type: 'uuid', notNull: true },
    name:          { type: 'varchar(100)', notNull: true },
    is_required:   { type: 'boolean', notNull: true, default: true },
    min_select:    { type: 'integer', notNull: true, default: 1 },
    max_select:    { type: 'integer', notNull: true, default: 1 },
  });
  pgm.createIndex('modifier_groups', ['restaurant_id']);

  pgm.createTable('modifier_options', {
    id:          { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    group_id:    { type: 'uuid', notNull: true, references: '"modifier_groups"', onDelete: 'CASCADE' },
    label:       { type: 'varchar(100)', notNull: true },
    price_delta: { type: 'numeric(8,2)', notNull: true, default: 0 },
    is_default:  { type: 'boolean', notNull: true, default: false },
  });

  pgm.createTable('recipe_modifier_overrides', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    recipe_id:     { type: 'uuid', notNull: true, references: '"recipes"', onDelete: 'CASCADE' },
    option_id:     { type: 'uuid', notNull: true, references: '"modifier_options"', onDelete: 'CASCADE' },
    ingredient_id: { type: 'uuid', notNull: true, references: '"ingredients"', onDelete: 'CASCADE' },
    quantity:      { type: 'numeric(10,4)', notNull: true },
    unit:          { type: 'varchar(20)', notNull: true },
  });
  pgm.addConstraint('recipe_modifier_overrides', 'rmo_recipe_option_ingredient_unique', 'UNIQUE (recipe_id, option_id, ingredient_id)');
};

exports.down = (pgm) => {
  pgm.dropTable('recipe_modifier_overrides');
  pgm.dropTable('modifier_options');
  pgm.dropTable('modifier_groups');
};
