exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE loyalty_customers
      ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE loyalty_customers
      DROP COLUMN IF EXISTS whatsapp_opt_in;
  `);
};
