/*
 * 065_restaurants_public_token
 *
 * The walk-in waitlist / ETA feature needs a single, restaurant-level public
 * entry point: a door QR (placed at the host stand / entrance) that lets a
 * waiting party onboard themselves before they have a table. Per-table tokens
 * (tables.public_token, migration 060) can't serve this — a waiting guest has
 * no table yet.
 *
 * Add a dedicated random, rotatable `public_token` on restaurants, mirroring the
 * per-table token: gen_random_uuid() is volatile so Postgres evaluates the
 * default per row, giving every existing restaurant its own distinct token and
 * satisfying the unique index.
 */
exports.up = (pgm) => {
  pgm.addColumn('restaurants', {
    public_token: { type: 'uuid', notNull: true, default: pgm.func('gen_random_uuid()') },
  });
  pgm.createIndex('restaurants', 'public_token', { unique: true });
};

exports.down = (pgm) => {
  pgm.dropIndex('restaurants', 'public_token', { unique: true });
  pgm.dropColumn('restaurants', 'public_token');
};
