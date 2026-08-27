exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS description TEXT`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE menu_items DROP COLUMN IF EXISTS description`);
};
