exports.up = (pgm) => {
  pgm.addColumn('super_admins', {
    defaults: { type: 'jsonb', notNull: true, default: '{}' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('super_admins', 'defaults');
};
