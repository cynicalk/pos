exports.up = (pgm) => {
  // order_items.order_id blocks cascade-deletion of orders
  pgm.dropConstraint('order_items', 'order_items_order_id_fkey');
  pgm.addConstraint('order_items', 'order_items_order_id_fkey',
    'FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE');

  // order_items.menu_item_id blocks cascade-deletion of menu_items
  pgm.dropConstraint('order_items', 'order_items_menu_item_id_fkey');
  pgm.addConstraint('order_items', 'order_items_menu_item_id_fkey',
    'FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE');

  // payments.order_id blocks cascade-deletion of orders
  pgm.dropConstraint('payments', 'payments_order_id_fkey');
  pgm.addConstraint('payments', 'payments_order_id_fkey',
    'FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE');
};

exports.down = (pgm) => {
  pgm.dropConstraint('order_items', 'order_items_order_id_fkey');
  pgm.addConstraint('order_items', 'order_items_order_id_fkey',
    'FOREIGN KEY (order_id) REFERENCES orders(id)');

  pgm.dropConstraint('order_items', 'order_items_menu_item_id_fkey');
  pgm.addConstraint('order_items', 'order_items_menu_item_id_fkey',
    'FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)');

  pgm.dropConstraint('payments', 'payments_order_id_fkey');
  pgm.addConstraint('payments', 'payments_order_id_fkey',
    'FOREIGN KEY (order_id) REFERENCES orders(id)');
};
