// Change timestamp columns to timestamptz so PostgreSQL stores them in UTC
// regardless of the server's local timezone or session timezone.
// EXTRACT(HOUR FROM ...) on a timestamptz column uses the session timezone,
// which we set to UTC in db.js, so hourly grouping is always in UTC.
exports.up = pgm => {
  pgm.alterColumn('orders',   'created_at', { type: 'timestamptz', default: pgm.func('now()') });
  pgm.alterColumn('payments', 'created_at', { type: 'timestamptz', default: pgm.func('now()') });
};

exports.down = pgm => {
  pgm.alterColumn('orders',   'created_at', { type: 'timestamp', default: pgm.func('now()') });
  pgm.alterColumn('payments', 'created_at', { type: 'timestamptz', default: pgm.func('now()') });
};