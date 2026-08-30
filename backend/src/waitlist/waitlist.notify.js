/*
 * waitlist.notify — the SINGLE place every guest-facing waitlist message goes
 * through. Today it drives the in-app experience (a WS ping to the staff
 * dashboard; the guest's web app polls its own status by token). The WhatsApp
 * Business API integration slots into the messaging outbox later — keep all
 * guest messaging routed through here so that wiring stays one function wide.
 */
const ws = require('../shared/websocket');
const messaging = require('../messaging/messaging.service');

const EVENTS = { QUEUED: 'QUEUED', ETA_UPDATE: 'ETA_UPDATE', TABLE_READY: 'TABLE_READY' };

// Outbox message kind per waitlist event, for the outbox screen to group by.
const KIND = {
  QUEUED: 'waitlist_queued',
  ETA_UPDATE: 'waitlist_eta',
  TABLE_READY: 'waitlist_ready',
};

function messageFor(event, entry) {
  const eta = entry.estimated_wait_minutes;
  switch (event) {
    case EVENTS.QUEUED:      return `Hi ${entry.guest_name}, you're on the waitlist${eta != null ? ` — about ~${eta} min` : ''}.`;
    case EVENTS.ETA_UPDATE:  return `Update: your table is about ~${eta ?? '—'} min away.`;
    case EVENTS.TABLE_READY: return `Your table is ready! Please see the host.`;
    default:                 return '';
  }
}

async function notify(entry, event, restaurantId) {
  // Staff dashboard live nudge.
  ws.broadcast('WAITLIST_NOTIFY', { waitlistId: entry.id, event }, restaurantId);

  // Guest channel: the web app polls by token today. The WhatsApp copy is
  // enqueued to the persisted outbox rather than fired at a stub — so it shows
  // as 'queued — pending channel connection' until the Business API drains it,
  // and 'skipped' (not lost) for a guest who never opted in.
  try {
    await messaging.enqueue(restaurantId, {
      kind: KIND[event] || 'waitlist',
      recipient: entry.guest_phone,
      recipientName: entry.guest_name,
      body: messageFor(event, entry),
      refId: entry.id,
      optIn: !!entry.whatsapp_opt_in,
    });
  } catch (e) { console.error('[waitlist][notify] enqueue failed', e?.message); }
}

module.exports = { notify, EVENTS };
