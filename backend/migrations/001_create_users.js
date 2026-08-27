exports.up = pgm => {
  pgm.createTable('users', {
    id:         { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email:      { type: 'varchar(255)', notNull: true, unique: true },
    password:   { type: 'varchar(255)', notNull: true },
    role:       { type: 'varchar(50)', notNull: true },
    created_at: { type: 'timestamp', default: pgm.func('now()') },
  });
};

exports.down = pgm => pgm.dropTable('users');
