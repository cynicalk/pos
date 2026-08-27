exports.up = (pgm) => {
  pgm.addColumn('menu_items', {
    sku: { type: 'varchar(100)' },
  });

  pgm.createIndex('menu_items', ['restaurant_id', 'sku'], {
    unique: true,
    where: 'sku IS NOT NULL',
    name: 'menu_items_sku_restaurant_unique',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('menu_items', ['restaurant_id', 'sku'], {
    name: 'menu_items_sku_restaurant_unique',
  });
  pgm.dropColumn('menu_items', 'sku');
};
