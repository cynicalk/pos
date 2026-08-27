exports.up = (pgm) => {
  pgm.addColumns('users', {
    password_changed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('users', ['password_changed_at']);
};
