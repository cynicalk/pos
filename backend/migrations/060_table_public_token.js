/*
 * 060_table_public_token
 *
 * The customer QR URL (/order/<id>) used the table's PRIMARY KEY as the public
 * identifier. Primary keys are not meant to be unguessable — sequential ids
 * (e.g. from seeding) let anyone enumerate every table by editing the URL.
 *
 * Add a dedicated random, rotatable `public_token` that the QR code and all
 * /api/public endpoints use instead of the internal id. gen_random_uuid() is
 * volatile, so Postgres evaluates the default per row — every existing table
 * gets its own distinct token, satisfying the unique index.
 *
 * NOTE: after this deploys the public endpoints key on public_token, so any QR
 * codes encoding the old table id will stop working and must be regenerated
 * from the dashboard (that's the point of moving off a guessable identifier).
 */
exports.up = (pgm) => {
  pgm.addColumn('tables', {
    public_token: { type: 'uuid', notNull: true, default: pgm.func('gen_random_uuid()') },
  });
  pgm.createIndex('tables', 'public_token', { unique: true });
};

exports.down = (pgm) => {
  pgm.dropIndex('tables', 'public_token', { unique: true });
  pgm.dropColumn('tables', 'public_token');
};
