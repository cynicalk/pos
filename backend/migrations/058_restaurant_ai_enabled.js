exports.up = (pgm) => {
  pgm.addColumn('restaurants', {
    ai_enabled: { type: 'boolean', notNull: true, default: true },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('restaurants', 'ai_enabled');
};
