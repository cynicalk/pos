const db          = require('../shared/db');
const tablesRepo  = require('../tables/tables.repository');
const ws          = require('../shared/websocket');

async function checkUpcoming() {
  try {
    const { rows } = await db.query(`
      SELECT r.*,
             t.number  AS table_number,
             t.status  AS table_status
      FROM   reservations r
      LEFT JOIN tables t ON t.id = r.table_id
      WHERE  r.status      = 'upcoming'
        AND  r.notified_at IS NULL
        AND  r.reserved_at <= NOW() + INTERVAL '15 minutes'
    `);

    for (const r of rows) {
      // Stamp first — prevents a second run from double-notifying if anything below throws
      await db.query('UPDATE reservations SET notified_at = NOW() WHERE id = $1', [r.id]);

      // Auto-reserve the table only if it is currently available
      if (r.table_id && r.table_status === 'available') {
        await tablesRepo.updateStatus(r.table_id, 'reserved', r.restaurant_id, {
          name:  r.guest_name,
          time:  r.reserved_at,
          party: r.party_size,
          notes: r.notes,
        });
        ws.broadcast('TABLE_UPDATED', { tableId: r.table_id }, r.restaurant_id);
      }

      ws.broadcast('RESERVATION_REMINDER', {
        reservationId: r.id,
        guestName:     r.guest_name,
        guestPhone:    r.guest_phone,
        partySize:     r.party_size,
        tableNumber:   r.table_number,
        reservedAt:    r.reserved_at,
      }, r.restaurant_id);
    }
  } catch (err) {
    console.error('[reservation-scheduler]', err.message);
  }
}

function start() {
  checkUpcoming();
  const timer = setInterval(checkUpcoming, 60 * 1000);
  // Don't hold the process open if nothing else is running
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { start };
