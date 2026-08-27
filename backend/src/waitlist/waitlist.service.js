/*
 * waitlist.service — the walk-in queue.
 *
 * Estimates come from the ETA engine: we feed the live queue (priority order)
 * into eta.getQueueEstimate, which greedily assigns each party the soonest
 * fitting table (respecting reservation holds + extra-chair opt-in) and returns
 * each party's wait. We persist those onto the rows so the staff list and the
 * guest's polled status agree, and so a future WhatsApp push has a value to send.
 */
const repo = require('./waitlist.repository');
const tablesService = require('../tables/tables.service');
const eta = require('../eta/eta.service');
const notifier = require('./waitlist.notify');
const ws = require('../shared/websocket');
const { NotFoundError, ValidationError } = require('../shared/errors');

const PHONE_RE = /^[0-9 +\-().]{7,20}$/;

function validatePayload({ guestName, partySize, guestPhone }) {
  if (!guestName || !String(guestName).trim()) throw new ValidationError('Guest name is required');
  const size = parseInt(partySize, 10);
  if (!Number.isInteger(size) || size < 1 || size > 50) throw new ValidationError('party_size must be between 1 and 50');
  if (guestPhone && !PHONE_RE.test(String(guestPhone).trim())) throw new ValidationError('Invalid phone number format');
  return size;
}

// Recompute every waiting party's ETA + queue position in one pass and persist
// the minutes onto each row. Returns the queue plus a lookup of computed values.
async function recomputeQueue(restaurantId) {
  const queue = await repo.getActiveQueue(restaurantId);
  const parties = queue.map((e) => ({
    partyId: e.id,
    partySize: e.party_size,
    extraChair: e.allow_extra_chair,
  }));
  const { assignments, avgTableTime } = await eta.getQueueEstimate(restaurantId, parties);
  const byId = new Map(assignments.map((a) => [a.partyId, a]));

  await Promise.all(
    queue.map((e) => repo.setEstimate(e.id, byId.get(e.id)?.waitMinutes ?? null)),
  );
  return { queue, byId, avgTableTime };
}

function shape(entry, computed) {
  const a = computed?.byId?.get(entry.id);
  const position = computed ? computed.queue.findIndex((q) => q.id === entry.id) + 1 : null;
  return {
    id: entry.id,
    token: entry.public_token,
    guestName: entry.guest_name,
    partySize: entry.party_size,
    status: entry.status,
    allowExtraChair: entry.allow_extra_chair,
    position: position > 0 ? position : null,
    estimatedWaitMinutes: a ? a.waitMinutes : entry.estimated_wait_minutes ?? null,
    assignedTableId: a ? a.tableId : entry.assigned_table_id ?? null,
    joinedAt: entry.joined_at,
  };
}

async function join(restaurantId, data) {
  const partySize = validatePayload(data);
  const entry = await repo.create({
    restaurantId,
    guestName: String(data.guestName).trim(),
    guestPhone: data.guestPhone ? String(data.guestPhone).trim() : null,
    whatsappOptIn: !!data.whatsappOptIn,
    partySize,
    allowExtraChair: !!data.allowExtraChair,
    prefs: data.prefs && typeof data.prefs === 'object' ? data.prefs : {},
  });

  const computed = await recomputeQueue(restaurantId);
  // Refetch so the entry carries the freshly-persisted estimate for the notify.
  const fresh = await repo.getById(entry.id, restaurantId);
  await notifier.notify(fresh, notifier.EVENTS.QUEUED, restaurantId);
  ws.broadcast('WAITLIST_UPDATED', { restaurantId }, restaurantId);

  return shape(fresh, computed);
}

async function list(restaurantId) {
  const computed = await recomputeQueue(restaurantId);
  const all = await repo.getAll(restaurantId);
  return all.map((e) => shape(e, computed));
}

// READ-ONLY status for the public guest poll. Computes this party's live queue
// position with a single SELECT and reuses the persisted estimated_wait_minutes
// — it never recomputes the whole queue or writes. The persisted estimates are
// kept fresh by recomputeQueue on every mutation (join/seat/cancel/no_show), so
// an unauthenticated phone polling this endpoint can't amplify into one write
// per waiting party per request.
async function getStatusByToken(token) {
  const entry = await repo.getByToken(token);
  if (!entry) throw new NotFoundError('Waitlist entry');
  if (entry.status !== 'waiting') return shape(entry, null); // resolved entries are static
  const queue = await repo.getActiveQueue(entry.restaurant_id);
  const position = queue.findIndex((q) => q.id === entry.id) + 1;
  return { ...shape(entry, null), position: position > 0 ? position : null };
}

async function seat(id, restaurantId, tableId) {
  const entry = await repo.getById(id, restaurantId);
  if (!entry) throw new NotFoundError('Waitlist entry');
  if (entry.status !== 'waiting') throw new ValidationError('Only a waiting party can be seated');
  if (!tableId) throw new ValidationError('tableId is required to seat a party');

  // Validate the table and that it's still free — guards the race where it got
  // taken between the staff loading the queue and clicking Seat. Occupying
  // funnels through tables.service, the session-logging chokepoint for when it
  // later frees.
  const table = await tablesService.getById(tableId, restaurantId); // throws if not found
  if (table.status !== 'available') {
    throw new ValidationError(`Table ${table.number} is no longer available`);
  }
  await tablesService.updateStatus(tableId, 'occupied', restaurantId);

  const seated = await repo.setStatus(id, restaurantId, 'seated', {
    seatedAt: true, assignedTableId: tableId, notifiedReady: true,
  });

  await notifier.notify(seated, notifier.EVENTS.TABLE_READY, restaurantId);
  ws.broadcast('TABLE_UPDATED', { tableId }, restaurantId);
  ws.broadcast('WAITLIST_UPDATED', { restaurantId }, restaurantId);
  // Seating one party shifts everyone else's ETA — refresh the persisted values.
  await recomputeQueue(restaurantId);
  return shape(seated, null);
}

async function setResolved(id, restaurantId, status) {
  const entry = await repo.getById(id, restaurantId);
  if (!entry) throw new NotFoundError('Waitlist entry');
  const updated = await repo.setStatus(id, restaurantId, status);
  ws.broadcast('WAITLIST_UPDATED', { restaurantId }, restaurantId);
  await recomputeQueue(restaurantId);
  return shape(updated, null);
}

const cancel = (id, restaurantId) => setResolved(id, restaurantId, 'cancelled');
const noShow = (id, restaurantId) => setResolved(id, restaurantId, 'no_show');

async function cancelByToken(token) {
  const entry = await repo.getByToken(token);
  if (!entry) throw new NotFoundError('Waitlist entry');
  if (entry.status !== 'waiting') return shape(entry, null); // already resolved — idempotent
  return cancel(entry.id, entry.restaurant_id);
}

module.exports = { join, list, getStatusByToken, seat, cancel, noShow, cancelByToken };
