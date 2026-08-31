/**
 * A monotonic sequence for AI chat messages — the tie-proof boundary that
 * context compaction needs.
 *
 * Compaction folds older turns into a summary and replays only the messages
 * AFTER the fold. It marked that boundary with the last-folded message's
 * `created_at` and re-fetched "messages since" by timestamp. That is fragile:
 * `created_at` read into the app as a JS Date loses sub-millisecond precision,
 * so `created_at > boundary` re-includes the very messages that were folded, and
 * the replayed tail never actually shrinks — the summary is written but the
 * context keeps growing. Any two messages sharing a millisecond (a frozen clock,
 * rapid turns) break it outright.
 *
 * A `BIGSERIAL` gives every message a strictly increasing integer id, so the
 * boundary is an exact `seq > covers_seq` with no precision or tie ambiguity.
 * `covers_seq` on the summary row records how far it folded.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE ai_conversations ADD COLUMN seq BIGSERIAL;
    ALTER TABLE ai_conversations ADD COLUMN covers_seq BIGINT;
    CREATE INDEX idx_ai_conversations_seq ON ai_conversations (session_id, seq);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_ai_conversations_seq;
    ALTER TABLE ai_conversations DROP COLUMN IF EXISTS covers_seq;
    ALTER TABLE ai_conversations DROP COLUMN IF EXISTS seq;
  `);
};
