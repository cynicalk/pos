exports.up = (pgm) => {
  pgm.createTable('super_admins', {
    id:         { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email:      { type: 'varchar(255)', notNull: true, unique: true },
    password:   { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
  });
};

exports.down = (pgm) => pgm.dropTable('super_admins');
