exports.up = (pgm) => {
  // Drop CASCADE so deleting a restaurant nullifies the FK instead of removing logs
  pgm.dropConstraint('audit_logs', 'audit_logs_restaurant_id_fkey');
  pgm.addConstraint(
    'audit_logs',
    'audit_logs_restaurant_id_fkey',
    'FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE SET NULL',
  );

  // Denormalize the restaurant name at write time so renames don't rewrite history
  pgm.addColumn('audit_logs', {
    restaurant_name: { type: 'varchar(255)' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('audit_logs', 'restaurant_name');
  pgm.dropConstraint('audit_logs', 'audit_logs_restaurant_id_fkey');
  pgm.addConstraint(
    'audit_logs',
    'audit_logs_restaurant_id_fkey',
    'FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE',
  );
};
