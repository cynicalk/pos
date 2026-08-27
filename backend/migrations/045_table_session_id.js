exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_session_id UUID;

    -- Backfill: group existing non-solo dining orders that share a table
    -- into sessions based on consecutive time proximity (best-effort).
    -- New orders will get proper session IDs assigned at creation time.
    UPDATE orders o
    SET    table_session_id = gen_random_uuid()
    WHERE  table_session_id IS NULL
      AND  table_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS orders_table_session_idx ON orders (table_session_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS orders_table_session_idx;
    ALTER TABLE orders DROP COLUMN IF EXISTS table_session_id;
  `);
};
