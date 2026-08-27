exports.up = (pgm) => {
  pgm.addColumn('order_items', {
    cancel_reason: { type: 'varchar(255)' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('order_items', 'cancel_reason');
};
