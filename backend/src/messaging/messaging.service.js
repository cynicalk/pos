const repo = require('./messaging.repository');
const outbox = require('../modules/messaging/outbox');

/*
 * The one door every guest-facing message goes through on its way out.
 *
 * Until a real channel is connected, enqueue() persists the message at 'queued'
 * and returns — it does not pretend to deliver. That is the point: the outbox
 * screen can then say, truthfully, "12 messages queued, pending channel
 * connection" instead of a feature claiming it messaged someone when all it did
 * was write a log line. When the WhatsApp Business API is wired, a worker drains
 * 'queued' rows and moves them to 'sent'/'failed'; no caller changes.
 */

// Is an outbound channel actually connected? Feature-flagged off everywhere for
// now, so every real message correctly parks at 'queued'.
function channelConnected() {
  return !!process.env.WHATSAPP_ENABLED;
}

/**
 * Enqueue one message. A missing recipient or a guest who never opted in is
 * recorded as 'skipped' with the reason — never dropped silently, and never
 * counted as delivered.
 *
 * @param opts { channel?, kind, recipient, recipientName?, body, refId?, optIn? }
 */
async function enqueue(restaurantId, opts) {
  const { recipient, optIn = false } = opts;

  let status = 'queued';
  let statusReason = null;
  if (!recipient) {
    status = 'skipped';
    statusReason = 'no recipient on file';
  } else if (!optIn) {
    status = 'skipped';
    statusReason = 'guest has not opted in';
  } else if (!channelConnected()) {
    // Stays queued (not skipped): it is a real message we intend to send the
    // moment a channel exists, so it should drain automatically then.
    statusReason = 'pending channel connection';
  }

  return repo.enqueue(restaurantId, { ...opts, status, statusReason });
}

async function getOutbox(restaurantId, { status } = {}) {
  const [messages, counts] = await Promise.all([
    repo.list(restaurantId, { status: status || null }),
    repo.counts(restaurantId),
  ]);
  const summary = outbox.summarize(counts.flatMap((c) => Array(c.n).fill({ status: c.status })));
  return {
    channelConnected: channelConnected(),
    summary,
    messages,
  };
}

module.exports = { enqueue, getOutbox, channelConnected };
