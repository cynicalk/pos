exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE waste_logs
      ADD COLUMN IF NOT EXISTS menu_item_id   UUID REFERENCES menu_items(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS menu_item_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS batch_id       UUID;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE waste_logs
      DROP COLUMN IF EXISTS menu_item_id,
      DROP COLUMN IF EXISTS menu_item_name,
      DROP COLUMN IF EXISTS batch_id;
  `);
};
