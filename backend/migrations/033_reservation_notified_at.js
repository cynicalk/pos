exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE reservations DROP COLUMN IF EXISTS notified_at`);
};
