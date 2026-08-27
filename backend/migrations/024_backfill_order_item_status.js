exports.up = (pgm) => {
  pgm.sql("UPDATE order_items SET status = 'pending' WHERE status IS NULL");
  pgm.sql("ALTER TABLE order_items ALTER COLUMN status SET DEFAULT 'pending'");
};

exports.down = () => {};
