exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS staff_notifications (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      event         VARCHAR(50) NOT NULL,
      data          JSONB NOT NULL DEFAULT '{}',
      read          BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS staff_notifications_user_idx
      ON staff_notifications (user_id, read, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS staff_notifications_user_idx;
    DROP TABLE IF EXISTS staff_notifications;
  `);
};
