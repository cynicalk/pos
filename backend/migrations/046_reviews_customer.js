exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE reviews
      ADD COLUMN IF NOT EXISTS customer_phone       TEXT,
      ADD COLUMN IF NOT EXISTS loyalty_customer_id  UUID REFERENCES loyalty_customers(id) ON DELETE SET NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE reviews
      DROP COLUMN IF EXISTS customer_phone,
      DROP COLUMN IF EXISTS loyalty_customer_id;
  `);
};
