/**
 * Outbound message outbox — one persisted queue for every guest-facing message.
 *
 * Four features (waitlist alerts, winback, smart alerts, staff nudges) all
 * "send" today by writing to a console.log stub that vanishes the instant it
 * runs — so nothing can show what was sent, retry a failure, or even prove a
 * message was meant to go out. This table is the honest middle: a message is
 * ENQUEUED here the moment a feature wants it sent, and sits at status 'queued'
 * until a real channel (the WhatsApp Business API) is connected to drain it.
 *
 * That flips those features from "pretends to send" to "queued — pending channel
 * connection", which is a true statement the operator can see, instead of a
 * fire-and-forget log line. When the channel lands, a worker moves rows
 * queued → sent (or → failed with a reason); nothing else about the callers
 * changes, because they already route through one enqueue().
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE outbound_messages (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      channel        TEXT NOT NULL DEFAULT 'whatsapp',
      kind           TEXT NOT NULL,
      recipient      TEXT,
      recipient_name TEXT,
      body           TEXT NOT NULL,
      ref_id         UUID,
      status         TEXT NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
      status_reason  TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      sent_at        TIMESTAMPTZ
    );
    CREATE INDEX idx_outbound_restaurant_status ON outbound_messages (restaurant_id, status, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS outbound_messages;');
};
