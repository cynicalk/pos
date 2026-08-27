exports.up = (pgm) => {
  pgm.addColumns('tables', {
    x_pos: { type: 'integer' },
    y_pos: { type: 'integer' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('tables', ['x_pos', 'y_pos']);
};
