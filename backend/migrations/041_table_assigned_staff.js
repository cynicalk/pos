exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE tables ADD COLUMN IF NOT EXISTS assigned_staff_id UUID REFERENCES users(id) ON DELETE SET NULL;`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE tables DROP COLUMN IF EXISTS assigned_staff_id;`);
};
