exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE coupons (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id     UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      code              VARCHAR(50) NOT NULL,
      description       TEXT,
      discount_type     VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'flat')),
      discount_value    NUMERIC(10,2) NOT NULL,
      min_order_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
      max_uses          INTEGER,
      uses_count        INTEGER NOT NULL DEFAULT 0,
      expires_at        TIMESTAMPTZ,
      is_active         BOOLEAN NOT NULL DEFAULT true,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (restaurant_id, code)
    );
    CREATE INDEX idx_coupons_restaurant ON coupons (restaurant_id);

    CREATE TABLE coupon_redemptions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      coupon_id       UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
      order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      discount_amount NUMERIC(10,2) NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (order_id)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS coupon_redemptions;
    DROP TABLE IF EXISTS coupons;
  `);
};
