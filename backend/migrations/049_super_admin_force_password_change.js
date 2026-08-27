exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE super_admins
      ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT FALSE;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE super_admins DROP COLUMN IF EXISTS force_password_change;
  `);
};
