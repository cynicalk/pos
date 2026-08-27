exports.up = (pgm) => {
  pgm.addColumn('restaurants', {
    is_active: { type: 'boolean', notNull: true, default: true },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('restaurants', 'is_active');
};
