exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified              BOOLEAN     NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS verification_token         VARCHAR(64),
      ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reset_token                VARCHAR(64),
      ADD COLUMN IF NOT EXISTS reset_token_expires_at     TIMESTAMPTZ;

    -- Grandfather all existing accounts as verified so nobody gets locked out.
    UPDATE users SET email_verified = TRUE;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS email_verified,
      DROP COLUMN IF EXISTS verification_token,
      DROP COLUMN IF EXISTS verification_token_expires_at,
      DROP COLUMN IF EXISTS reset_token,
      DROP COLUMN IF EXISTS reset_token_expires_at;
  `);
};
