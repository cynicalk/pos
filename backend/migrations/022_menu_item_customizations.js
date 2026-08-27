exports.up = (pgm) => {
  pgm.addColumn('menu_items', { customization_groups: { type: 'jsonb' } });
  pgm.sql("ALTER TABLE menu_items ALTER COLUMN customization_groups SET DEFAULT '[]'::jsonb");
  pgm.sql("UPDATE menu_items SET customization_groups = '[]'::jsonb WHERE customization_groups IS NULL");

  pgm.addColumn('order_items', { customizations: { type: 'jsonb' } });
  pgm.sql("ALTER TABLE order_items ALTER COLUMN customizations SET DEFAULT '{}'::jsonb");
  pgm.sql("UPDATE order_items SET customizations = '{}'::jsonb WHERE customizations IS NULL");
};

exports.down = (pgm) => {
  pgm.dropColumn('order_items', 'customizations');
  pgm.dropColumn('menu_items', 'customization_groups');
};
