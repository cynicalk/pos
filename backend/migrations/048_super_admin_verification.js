exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE super_admins
      ADD COLUMN IF NOT EXISTS email_verified              BOOLEAN     NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS verification_token         VARCHAR(64),
      ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ;

    -- Grandfather existing super admins as verified so nobody gets locked out.
    UPDATE super_admins SET email_verified = TRUE;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE super_admins
      DROP COLUMN IF EXISTS email_verified,
      DROP COLUMN IF EXISTS verification_token,
      DROP COLUMN IF EXISTS verification_token_expires_at;
  `);
};
