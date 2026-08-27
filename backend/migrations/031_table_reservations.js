exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE tables
      ADD COLUMN IF NOT EXISTS reservation_name  text,
      ADD COLUMN IF NOT EXISTS reservation_time  timestamptz,
      ADD COLUMN IF NOT EXISTS reservation_notes text,
      ADD COLUMN IF NOT EXISTS reservation_party integer
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE tables
      DROP COLUMN IF EXISTS reservation_name,
      DROP COLUMN IF EXISTS reservation_time,
      DROP COLUMN IF EXISTS reservation_notes,
      DROP COLUMN IF EXISTS reservation_party
  `);
};
