exports.up = pgm => {
  pgm.addColumn('orders', {
    channel:      { type: 'varchar(20)', notNull: true, default: "'dining'" },
    customer_ref: { type: 'varchar(255)' },
  });
  pgm.alterColumn('orders', 'table_id', { notNull: false });
};

exports.down = pgm => {
  pgm.dropColumn('orders', 'channel');
  pgm.dropColumn('orders', 'customer_ref');
  pgm.alterColumn('orders', 'table_id', { notNull: true });
};
