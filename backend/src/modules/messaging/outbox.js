/**
 * Outbox policy — pure helpers for the outbound message queue.
 *
 * The queue's whole value is that it never lies about a message's fate, so the
 * status vocabulary is deliberately small and the transitions are one-way:
 *
 *   queued  → sent | failed     (a channel tried to deliver it)
 *   queued  → skipped            (never attempted — no opt-in, or no channel)
 *
 * 'skipped' is not a failure: it records a message we correctly chose NOT to
 * send (a guest who never opted in), which is different from one we tried and
 * could not deliver. Collapsing the two would either overstate delivery or
 * invent failures, and both are the kind of dishonesty the queue exists to
 * prevent.
 */

const STATUSES = ['queued', 'sent', 'failed', 'skipped'];

const ALLOWED = {
  queued: ['sent', 'failed', 'skipped'],
  sent: [],
  failed: ['queued'], // a retry re-queues
  skipped: [],
};

function canTransition(from, to) {
  return STATUSES.includes(to) && (ALLOWED[from] || []).includes(to);
}

/** Roll a list of messages up into the counts a screen leads with. */
function summarize(messages = []) {
  const by = { queued: 0, sent: 0, failed: 0, skipped: 0 };
  for (const m of messages) {
    if (by[m.status] !== undefined) by[m.status] += 1;
  }
  return {
    total: messages.length,
    ...by,
    // The honest headline while no channel is connected: everything real is
    // waiting, not delivered.
    pendingChannel: by.queued,
  };
}

module.exports = { STATUSES, canTransition, summarize };
