exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS reviews (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      table_id       UUID REFERENCES tables(id) ON DELETE SET NULL,
      overall_rating SMALLINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
      food_rating    SMALLINT CHECK (food_rating BETWEEN 1 AND 5),
      service_rating SMALLINT CHECK (service_rating BETWEEN 1 AND 5),
      comment        TEXT CHECK (char_length(comment) <= 500),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS reviews_restaurant_idx
      ON reviews (restaurant_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS reviews_restaurant_idx;
    DROP TABLE IF EXISTS reviews;
  `);
};
