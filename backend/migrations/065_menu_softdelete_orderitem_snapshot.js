// M1 (critical) + O2: protect order history from menu-item deletion, and snapshot
// each line item's name + unit price at order time.
//
// The reachable data-loss path was the admin "delete menu item" endpoint: order_items
// → menu_items is ON DELETE CASCADE, so a hard delete silently destroyed every
// historical order line that used the item (corrupting orders, receipts, reports).
//
// Fix: menu items are now **soft-deleted** (archived) by the app, so a hard delete
// never happens through application code. The FK is left as CASCADE on purpose —
// it is the mechanism for intentional *tenant* deletion (deleting a restaurant must
// still cascade its menu + orders); switching it to RESTRICT would break that, and
// SET NULL would require making `menu_item_id` nullable. Soft-delete removes the
// exploit without touching the cascade.
//
// We also snapshot `item_name` + `unit_price` onto order_items so a line's price/name
// are fixed at order time (fixes price-drift when a menu price later changes — O2).

exports.up = (pgm) => {
  // Soft-delete marker for menu items (hidden from menus + the orderable list once set).
  pgm.addColumn('menu_items', {
    archived_at: { type: 'timestamptz' },
  });

  // Captured-at-order-time snapshot of the line item.
  pgm.addColumns('order_items', {
    item_name:  { type: 'varchar(255)' },
    unit_price: { type: 'numeric(14,6)' },
  });
  pgm.sql(`
    UPDATE order_items oi
       SET item_name  = mi.name,
           unit_price = mi.price
      FROM menu_items mi
     WHERE oi.menu_item_id = mi.id
       AND oi.unit_price IS NULL
  `);
};

exports.down = (pgm) => {
  pgm.dropColumns('order_items', ['item_name', 'unit_price']);
  pgm.dropColumn('menu_items', 'archived_at');
};
