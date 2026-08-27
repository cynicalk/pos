exports.up = (pgm) => {
  pgm.createTable('audit_logs', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    restaurant_id: { type: 'uuid', references: 'restaurants', onDelete: 'CASCADE' },
    actor_type:    { type: 'varchar(20)', notNull: true },  // 'super_admin' | 'user'
    actor_id:      { type: 'uuid', notNull: true },
    action:        { type: 'varchar(50)', notNull: true },  // 'create' | 'update' | 'delete' | 'payment' | 'login'
    resource_type: { type: 'varchar(50)', notNull: true },  // 'restaurant' | 'user' | 'setting' | 'order' | 'menu_item' | 'payment'
    resource_id:   { type: 'varchar(255)' },
    description:   { type: 'text', notNull: true },
    meta:          { type: 'jsonb' },
    created_at:    { type: 'timestamptz', default: pgm.func('now()') },
  });

  pgm.createIndex('audit_logs', 'restaurant_id');
  pgm.createIndex('audit_logs', 'created_at');
  pgm.createIndex('audit_logs', 'resource_type');
};

exports.down = (pgm) => {
  pgm.dropTable('audit_logs');
};
