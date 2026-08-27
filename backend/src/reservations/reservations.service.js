const repo        = require('./reservations.repository');
const tablesRepo  = require('../tables/tables.repository');
const ws          = require('../shared/websocket');
const { NotFoundError, ValidationError } = require('../shared/errors');
const { validateTimezone } = require('../shared/timezone');

async function getAll(restaurantId, query = {}) {
  return repo.getAll(restaurantId, { ...query, tz: validateTimezone(query.tz, 'UTC') });
}

async function create(restaurantId, { tableId, guestName, guestPhone, partySize, reservedAt, notes }) {
  if (!guestName?.trim()) throw new ValidationError('Guest name is required');
  if (!reservedAt)        throw new ValidationError('Reservation time is required');
  if (tableId) {
    const t = await tablesRepo.getById(tableId, restaurantId);
    if (!t) throw new NotFoundError('Table');
  }

  const reservation = await repo.create({
    restaurantId,
    tableId,
    guestName: guestName.trim(),
    guestPhone: guestPhone?.trim() || null,
    partySize: partySize ? parseInt(partySize) : null,
    reservedAt,
    notes: notes?.trim() || null,
  });

  if (tableId) {
    await tablesRepo.updateStatus(tableId, 'reserved', restaurantId, {
      name:  reservation.guest_name,
      time:  reservation.reserved_at,
      party: reservation.party_size,
      notes: reservation.notes,
    });
    ws.broadcast('TABLE_UPDATED', { tableId }, restaurantId);
  }

  return reservation;
}

async function update(id, restaurantId, fields) {
  const existing = await repo.getById(id, restaurantId);
  if (!existing) throw new NotFoundError('Reservation');

  const updated = await repo.update(id, restaurantId, fields);

  if (updated.table_id) {
    await tablesRepo.updateStatus(updated.table_id, 'reserved', restaurantId, {
      name:  updated.guest_name,
      time:  updated.reserved_at,
      party: updated.party_size,
      notes: updated.notes,
    });
    ws.broadcast('TABLE_UPDATED', { tableId: updated.table_id }, restaurantId);
  }

  return updated;
}

async function remove(id, restaurantId) {
  const existing = await repo.getById(id, restaurantId);
  if (!existing) throw new NotFoundError('Reservation');

  if (existing.table_id) {
    const table = await tablesRepo.getById(existing.table_id, restaurantId);
    if (table?.status === 'reserved') {
      await tablesRepo.updateStatus(existing.table_id, 'available', restaurantId);
      ws.broadcast('TABLE_UPDATED', { tableId: existing.table_id }, restaurantId);
    }
  }

  return repo.remove(id, restaurantId);
}

async function seat(id, restaurantId) {
  const existing = await repo.getById(id, restaurantId);
  if (!existing) throw new NotFoundError('Reservation');
  if (existing.status !== 'upcoming') throw new ValidationError('Only upcoming reservations can be seated');

  const updated = await repo.update(id, restaurantId, { status: 'seated' });

  if (existing.table_id) {
    await tablesRepo.updateStatus(existing.table_id, 'occupied', restaurantId);
    ws.broadcast('TABLE_UPDATED', { tableId: existing.table_id }, restaurantId);
  }

  return updated;
}

async function cancel(id, restaurantId) {
  const existing = await repo.getById(id, restaurantId);
  if (!existing) throw new NotFoundError('Reservation');

  const updated = await repo.update(id, restaurantId, { status: 'cancelled' });

  if (existing.table_id) {
    const table = await tablesRepo.getById(existing.table_id, restaurantId);
    if (table?.status === 'reserved') {
      await tablesRepo.updateStatus(existing.table_id, 'available', restaurantId);
      ws.broadcast('TABLE_UPDATED', { tableId: existing.table_id }, restaurantId);
    }
  }

  return updated;
}

async function noShow(id, restaurantId) {
  const existing = await repo.getById(id, restaurantId);
  if (!existing) throw new NotFoundError('Reservation');

  const updated = await repo.update(id, restaurantId, { status: 'no_show' });

  if (existing.table_id) {
    const table = await tablesRepo.getById(existing.table_id, restaurantId);
    if (table?.status === 'reserved') {
      await tablesRepo.updateStatus(existing.table_id, 'available', restaurantId);
      ws.broadcast('TABLE_UPDATED', { tableId: existing.table_id }, restaurantId);
    }
  }

  return updated;
}

module.exports = { getAll, create, update, remove, seat, cancel, noShow };
