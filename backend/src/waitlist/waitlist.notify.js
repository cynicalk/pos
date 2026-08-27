/*
 * waitlist.notify — the SINGLE place every guest-facing waitlist message goes
 * through. Today it drives the in-app experience (a WS ping to the staff
 * dashboard; the guest's web app polls its own status by token). The WhatsApp
 * Business API integration slots into sendWhatsApp() later — keep all guest
 * messaging routed through here so that wiring stays one function wide.
 */
const ws = require('../shared/websocket');

const EVENTS = { QUEUED: 'QUEUED', ETA_UPDATE: 'ETA_UPDATE', TABLE_READY: 'TABLE_READY' };

function messageFor(event, entry) {
  const eta = entry.estimated_wait_minutes;
  switch (event) {
    case EVENTS.QUEUED:      return `Hi ${entry.guest_name}, you're on the waitlist${eta != null ? ` — about ~${eta} min` : ''}.`;
    case EVENTS.ETA_UPDATE:  return `Update: your table is about ~${eta ?? '—'} min away.`;
    case EVENTS.TABLE_READY: return `Your table is ready! Please see the host.`;
    default:                 return '';
  }
}

// Placeholder for the WhatsApp Business API. Feature-flagged OFF until wired so
// it is a safe no-op in every current environment; logs intent for traceability.
async function sendWhatsApp(phone, message) {
  if (!process.env.WHATSAPP_ENABLED) return;
  // TODO: POST to the WhatsApp Business API here (respect opt-in/consent).
  console.log('[waitlist][whatsapp:stub]', phone, '->', message);
}

async function notify(entry, event, restaurantId) {
  // Staff dashboard live nudge.
  ws.broadcast('WAITLIST_NOTIFY', { waitlistId: entry.id, event }, restaurantId);

  // Guest channel: web app polls by token today; WhatsApp once opted in + wired.
  if (entry.guest_phone && entry.whatsapp_opt_in) {
    try { await sendWhatsApp(entry.guest_phone, messageFor(event, entry)); }
    catch (e) { console.error('[waitlist][notify] whatsapp failed', e?.message); }
  }
}

module.exports = { notify, EVENTS };
