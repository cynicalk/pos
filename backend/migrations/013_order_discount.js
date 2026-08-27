exports.up = (pgm) => {
  pgm.addColumns('orders', {
    discount_type:  { type: 'varchar(10)' },               // 'percent' | 'flat' | null
    discount_value: { type: 'numeric(10,2)', default: 0, notNull: true },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('orders', ['discount_type', 'discount_value']);
};
