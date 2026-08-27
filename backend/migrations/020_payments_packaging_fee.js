exports.up = pgm => {
  pgm.addColumns('payments', {
    packaging_fee: { type: 'numeric(10,2)', notNull: true, default: 0 },
  });
};

exports.down = pgm => {
  pgm.dropColumns('payments', ['packaging_fee']);
};
