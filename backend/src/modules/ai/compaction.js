// AI chat context compaction — the decision, kept pure.
//
// A long conversation's replayed tail grows until it crowds out the system
// prompt and the tool schemas in the model's small context window. When it does,
// the older turns are folded into a running summary and only the recent tail is
// replayed verbatim (summary + tail). This module decides WHEN to fold and WHICH
// messages to fold, so the "too many rounds" thresholds are arguable in a test
// rather than only observable in production. The folding itself (the LLM call and
// the DB write) stays in the service.

const DEFAULTS = {
  keepTail: 6,        // most recent messages always replayed verbatim
  charBudget: 3000,   // ~750 tokens of tail triggers a fold …
  msgBudget: 16,      // … or this many messages, whichever comes first
};

const tailChars = (msgs = []) => msgs.reduce((n, m) => n + (m.content?.length || 0), 0);

/**
 * Decide whether to compact, and split the tail accordingly.
 *
 * @param {Array<{role,content}>} tail  messages since the last summary, oldest first
 * @param {{keepTail?:number, charBudget?:number, msgBudget?:number}} [opts]
 * @returns {{ shouldFold: boolean, toFold: Array, keptTail: Array }}
 *   shouldFold — whether a fold is due;
 *   toFold     — the older messages to summarise (empty when not folding);
 *   keptTail   — the messages to replay verbatim (the whole tail when not folding).
 *
 * A fold is due only once there are MORE than keepTail messages (so a short chat
 * is never compacted) AND the tail has outgrown either budget. Folding never
 * touches the last keepTail messages, so the immediate context a reply needs is
 * always present in full.
 */
function planCompaction(tail = [], opts = {}) {
  const { keepTail, charBudget, msgBudget } = { ...DEFAULTS, ...opts };

  const overflowing = tailChars(tail) > charBudget || tail.length > msgBudget;
  if (tail.length <= keepTail || !overflowing) {
    return { shouldFold: false, toFold: [], keptTail: tail };
  }
  const cut = tail.length - keepTail;
  return { shouldFold: true, toFold: tail.slice(0, cut), keptTail: tail.slice(cut) };
}

module.exports = { planCompaction, tailChars, DEFAULTS };
