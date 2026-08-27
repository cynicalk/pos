// Increase decimal precision so currency conversions don't round-trip badly.
// numeric(10,2) caused e.g. 50 INR → 0.60 USD → 50.10 INR.
// numeric(14,6) keeps enough precision for all currencies in currencies.json.
exports.up = pgm => {
  pgm.alterColumn('menu_items', 'price',  { type: 'numeric(14,6)' });
  pgm.alterColumn('payments',   'amount', { type: 'numeric(14,6)' });
};

exports.down = pgm => {
  pgm.alterColumn('menu_items', 'price',  { type: 'numeric(10,2)' });
  pgm.alterColumn('payments',   'amount', { type: 'numeric(10,2)' });
};
