exports.up = (pgm) => {
  pgm.createTable('settings', {
    key:   { type: 'varchar(100)', primaryKey: true },
    value: { type: 'text', notNull: true },
  });

  pgm.sql(`
    INSERT INTO settings (key, value) VALUES
      ('timezone', 'UTC'),
      ('currency', 'USD');
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('settings');
};
