exports.up = (pgm) => {
  pgm.addColumn('users', {
    force_password_change: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('users', 'force_password_change');
};
