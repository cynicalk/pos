// Operator roles for the admin portal. Until now every super_admins row was
// implicitly a full super admin; add an explicit role so we can grant company
// staff (e.g. product managers) portal access without operator-management rights.
exports.up = (pgm) => {
  pgm.addColumn('super_admins', {
    role: { type: 'varchar(20)', notNull: true, default: 'super_admin' },
  });
  pgm.addConstraint('super_admins', 'super_admins_role_check',
    "CHECK (role IN ('super_admin', 'product_manager'))");
};

exports.down = (pgm) => {
  pgm.dropConstraint('super_admins', 'super_admins_role_check');
  pgm.dropColumn('super_admins', 'role');
};
