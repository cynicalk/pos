exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS loyalty_tiers (
      id            SERIAL PRIMARY KEY,
      restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      min_points    INTEGER NOT NULL DEFAULT 0,
      color         TEXT,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS loyalty_rewards (
      id            SERIAL PRIMARY KEY,
      restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      description   TEXT,
      icon          TEXT NOT NULL DEFAULT '%',
      points_cost   INTEGER NOT NULL,
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS loyalty_rewards;
    DROP TABLE IF EXISTS loyalty_tiers;
  `);
};
