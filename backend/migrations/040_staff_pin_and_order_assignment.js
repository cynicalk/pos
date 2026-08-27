exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_pin VARCHAR(6);

    ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_staff_id UUID REFERENCES users(id) ON DELETE SET NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS users_staff_pin_restaurant_idx
      ON users (restaurant_id, staff_pin)
      WHERE staff_pin IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS users_staff_pin_restaurant_idx;
    ALTER TABLE orders DROP COLUMN IF EXISTS assigned_staff_id;
    ALTER TABLE users DROP COLUMN IF EXISTS staff_pin;
  `);
};
