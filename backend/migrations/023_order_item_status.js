exports.up = (pgm) => {
  pgm.addColumn('order_items', {
    status: { type: 'varchar(20)', notNull: true, default: "'pending'" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('order_items', 'status');
};
