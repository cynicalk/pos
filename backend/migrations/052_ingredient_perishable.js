exports.up = (pgm) => {
  pgm.addColumn('ingredients', {
    perishable: { type: 'boolean', notNull: true, default: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('ingredients', 'perishable');
};
