import { db } from '../db';
import api from '../api/client';

export async function enqueue(entity, operation, payload, localId = null) {
  await db.sync_queue.add({
    entity,
    operation,
    payload,
    localId,
    status: 'pending',
    created_at: Date.now(),
  });
}

export async function getPendingCount() {
  return db.sync_queue.where('status').equals('pending').count();
}

export async function getErrorCount() {
  return db.sync_queue.where('status').equals('error').count();
}

// Reset all error entries to pending so the next flush retries them
export async function retryErrors() {
  await db.sync_queue.where('status').equals('error').modify({ status: 'pending', error: null });
}

// Process all pending mutations in creation order.
// Tracks local→real ID mappings so operations created while offline
// that reference a local ID (e.g. add items to a locally-created order)
// are remapped before dispatch.
export async function flushQueue() {
  const pending = await db.sync_queue
    .where('status')
    .equals('pending')
    .sortBy('created_at');

  // localId → real server ID, built up as POSTs complete
  const idMap = {};

  let synced = 0;
  let errors = 0;

  for (const item of pending) {
    try {
      const payload = remapPayload(item.payload, idMap);
      const result = await dispatch({ ...item, payload });

      if (item.localId && result?.id) {
        idMap[item.localId] = result.id;
        await replaceLocalRecord(item.entity, item.localId, result);
      }

      await db.sync_queue.update(item.id, { status: 'synced', synced_at: Date.now() });
      synced++;
    } catch (e) {
      await db.sync_queue.update(item.id, { status: 'error', error: e.message });
      errors++;
    }
  }

  // Prune synced entries older than 1 hour
  const cutoff = Date.now() - 3_600_000;
  await db.sync_queue
    .where('status')
    .equals('synced')
    .and((r) => r.synced_at < cutoff)
    .delete();

  return { synced, errors };
}

// Substitute any local IDs that were resolved earlier in this flush
function remapPayload(payload, idMap) {
  if (!payload || !Object.keys(idMap).length) return payload;
  const out = { ...payload };
  if (out.id     && idMap[out.id])      out.id      = idMap[out.id];
  if (out.orderId && idMap[out.orderId]) out.orderId = idMap[out.orderId];
  return out;
}

// After a POST resolves, replace the local stub in Dexie with the server record
async function replaceLocalRecord(entity, localId, serverRecord) {
  switch (entity) {
    case 'menu':
      await db.menu.delete(localId);
      await db.menu.put(serverRecord);
      break;
    case 'orders':
      // Remove the local kitchen stubs; the next kitchen queue fetch will populate correctly
      await db.kitchen.where('order_id').equals(localId).delete();
      break;
    case 'tables':
      await db.restaurant_tables.delete(localId);
      await db.restaurant_tables.put(serverRecord);
      break;
  }
}

async function dispatch({ entity, operation, payload }) {
  switch (`${entity}:${operation}`) {
    // ── Menu ──────────────────────────────────────────────────────────────
    case 'menu:POST': {
      const { data } = await api.post('/menu', payload);
      return data;
    }
    case 'menu:PATCH': {
      const { id, ...fields } = payload;
      const { data } = await api.patch(`/menu/${id}`, fields);
      return data;
    }
    case 'menu:DELETE':
      await api.delete(`/menu/${payload.id}`);
      return null;

    // ── Tables ────────────────────────────────────────────────────────────
    case 'tables:POST': {
      const { data } = await api.post('/tables', payload);
      return data;
    }
    case 'tables:PATCH':
      await api.patch(`/tables/${payload.id}/status`, { status: payload.status });
      return null;

    // ── Orders ────────────────────────────────────────────────────────────
    case 'orders:POST': {
      const { data } = await api.post('/orders', payload);
      return data;
    }
    case 'orders:PATCH':
      await api.patch(`/orders/${payload.id}/status`, { status: payload.status });
      return null;
    case 'orders:items:POST': {
      const { orderId, items } = payload;
      const { data } = await api.post(`/orders/${orderId}/items`, { items });
      return data;
    }
    case 'orders:items:PATCH':
      await api.patch(
        `/orders/${payload.orderId}/items/${payload.itemId}/status`,
        { status: payload.status },
      );
      return null;
    case 'orders:cancel-pending:POST':
      await api.post(`/orders/${payload.orderId}/cancel-pending`);
      return null;

    // ── Payments ──────────────────────────────────────────────────────────
    case 'payments:POST': {
      const { orderId, ...body } = payload;
      const { data } = await api.post(`/payments/${orderId}`, body);
      return data;
    }
    case 'payments:split:POST': {
      const { orderId, ...body } = payload;
      const { data } = await api.post(`/payments/${orderId}/split`, body);
      return data;
    }

    default:
      throw new Error(`Unhandled sync operation: ${entity}:${operation}`);
  }
}
