/**
 * Visit intent — the single most predictive pre-seating signal (ETA spec v3 §3).
 *
 * A waiting party declares whether they are here to eat, to chill, or both, and
 * that shapes how long their table will hold from the first estimate. Captured
 * at waitlist intake, carried onto the table_session at close so the Phase-2
 * predictive engine can learn intent-specific durations rather than the static
 * multipliers the live engine uses today.
 *
 * Nullable on purpose: tables seated directly (not through the waitlist) and
 * every session already on record have no declared intent, and the engine treats
 * a missing intent as neutral (1.0x) — so this adds a signal without disturbing
 * anything that predates it.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE waitlist       ADD COLUMN IF NOT EXISTS visit_intent text;
    ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS visit_intent text;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE waitlist       DROP COLUMN IF EXISTS visit_intent;
    ALTER TABLE table_sessions DROP COLUMN IF EXISTS visit_intent;
  `);
};
