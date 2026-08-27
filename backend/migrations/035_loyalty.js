exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE loyalty_customers (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      phone         VARCHAR(30) NOT NULL,
      name          VARCHAR(255),
      points_balance INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (restaurant_id, phone)
    );
    CREATE INDEX idx_loyalty_customers_restaurant ON loyalty_customers (restaurant_id);

    CREATE TABLE loyalty_transactions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      customer_id   UUID NOT NULL REFERENCES loyalty_customers(id) ON DELETE CASCADE,
      order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
      type          VARCHAR(10) NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust')),
      points        INTEGER NOT NULL,
      description   TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_loyalty_txn_customer ON loyalty_transactions (restaurant_id, customer_id);
    CREATE INDEX idx_loyalty_txn_order   ON loyalty_transactions (order_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS loyalty_transactions;
    DROP TABLE IF EXISTS loyalty_customers;
  `);
};
