exports.up = pgm => {
  pgm.addColumns('payments', {
    tenders: { type: 'jsonb' },
  });
};

exports.down = pgm => {
  pgm.dropColumns('payments', ['tenders']);
};
