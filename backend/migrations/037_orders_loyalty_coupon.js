exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS coupon_id               UUID REFERENCES coupons(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS coupon_discount_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS loyalty_customer_id     UUID REFERENCES loyalty_customers(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS loyalty_discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

    ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS coupon_discount_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS loyalty_discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE payments
      DROP COLUMN IF EXISTS loyalty_discount_amount,
      DROP COLUMN IF EXISTS coupon_discount_amount;

    ALTER TABLE orders
      DROP COLUMN IF EXISTS loyalty_discount_amount,
      DROP COLUMN IF EXISTS loyalty_points_redeemed,
      DROP COLUMN IF EXISTS loyalty_customer_id,
      DROP COLUMN IF EXISTS coupon_discount_amount,
      DROP COLUMN IF EXISTS coupon_id;
  `);
};
