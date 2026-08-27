import { useQuery, useMutation } from '@tanstack/react-query';
import { db, dbMeta } from '../db';
import api from '../api/client';
import { enqueue } from '../store/syncQueue';
import { invalidate } from '../lib/queryClient';

// Returns true when an axios error means "no response was received" — i.e. the
// device is offline, the server refused the connection, or the request timed out.
// For actual API errors (4xx, 5xx) err.response IS defined, so we propagate those.
function isNetworkError(err) {
  return !err.response;
}

export function useActiveOrderByTable(tableId) {
  return useQuery({
    queryKey: ['orders', 'table', tableId],
    queryFn: async () => {
      const { data } = await api.get(`/orders/table/${tableId}`);
      return data ?? null;
    },
    enabled: !!tableId,
  });
}

export function useKitchenQueue() {
  return useQuery({
    queryKey: ['kitchen', 'queue'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/kitchen/queue');
        await db.kitchen.bulkPut(data);
        await dbMeta.setLastSync('kitchen');
        return data;
      } catch {
        return db.kitchen.toArray();
      }
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

// Group kitchen items into order-level summaries for the Orders page
export function useActiveOrders() {
  const { data: items = [], ...rest } = useKitchenQueue();

  const orders = Object.values(
    items.reduce((acc, item) => {
      if (!acc[item.order_id]) {
        acc[item.order_id] = {
          id:                      item.order_id,
          table_id:                item.table_id,
          table_session_id:        item.table_session_id     || null,
          table_number:            item.table_number,
          channel:                 item.channel               || 'dining',
          customer_ref:            item.customer_ref          || null,
          loyalty_customer_id:     item.loyalty_customer_id   || null,
          loyalty_customer_name:   item.loyalty_customer_name || null,
          loyalty_customer_phone:  item.loyalty_customer_phone|| null,
          loyalty_customer_tier:   item.loyalty_customer_tier || null,
          status:                  item.order_status,
          created_at:              item.order_created_at,
          assigned_staff_email:    item.assigned_staff_email  || null,
          assigned_staff_name:     item.assigned_staff_name   || null,
          total:                   0,
          items:                   [],
        };
      }
      acc[item.order_id].items.push(item);
      acc[item.order_id].total += (item.quantity || 0) * (parseFloat(item.item_price) || 0);
      return acc;
    }, {}),
  ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  return { data: orders, ...rest };
}

export function useCreateOrder() {
  return useMutation({
    mutationFn: async ({ tableId, items, channel, customerRef }) => {
      if (navigator.onLine) {
        try {
          const { data } = await api.post('/orders', { tableId, items, channel, customerRef });
          return data;
        } catch (err) {
          if (err.response) throw err; // real API error — propagate
          // network error despite onLine=true — fall through to offline path
        }
      }

      // Network unreachable — build a local stub visible in the kitchen queue.
      const localOrderId = `local_${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      const [table, menuItems] = await Promise.all([
        tableId ? db.restaurant_tables.get(tableId) : Promise.resolve(null),
        db.menu.bulkGet(items.map((i) => i.menuItemId)),
      ]);

      // Field names must match what Orders.jsx and useActiveOrders expect
      const kitchenItems = items.map((item, idx) => ({
        order_item_id:    `local_item_${crypto.randomUUID()}`,
        order_id:         localOrderId,
        table_id:         tableId      ?? null,
        table_number:     table?.number ?? null,
        channel:          channel      ?? 'dining',
        customer_ref:     customerRef  ?? null,
        order_status:     'received',
        order_created_at: now,
        menu_item_id:     item.menuItemId,
        item_name:        menuItems[idx]?.name ?? 'Unknown item',
        item_status:      'pending',
        quantity:         item.quantity,
        notes:            item.notes          ?? null,
        customizations:   item.customizations ?? null,
      }));

      await db.kitchen.bulkPut(kitchenItems);

      if (tableId) {
        await db.restaurant_tables.update(tableId, { status: 'occupied' });
      }

      await enqueue('orders', 'POST', { tableId, items, channel, customerRef }, localOrderId);

      return { id: localOrderId, status: 'received', created_at: now };
    },
    onSuccess: invalidate('kitchen', 'tables', 'order-history'),
  });
}

export function useOrderHistory({ from, to, status, channel, timezone }) {
  return useQuery({
    queryKey: ['order-history', from, to, status, channel, timezone],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (status)   params.set('status',   status);
      if (channel)  params.set('channel',  channel);
      if (timezone) params.set('timezone', timezone);
      const { data } = await api.get(`/orders/history?${params}`);
      return data;
    },
    enabled: !!from && !!to && !!timezone,
    staleTime: 0,
    refetchInterval: 30_000,
  });
}

export function useCancelPendingItems() {
  return useMutation({
    mutationFn: async (orderId) => {
      if (navigator.onLine) {
        try {
          const { data } = await api.post(`/orders/${orderId}/cancel-pending`);
          return data;
        } catch (err) {
          if (err.response) throw err;
        }
      }
      await db.kitchen
        .where('order_id').equals(orderId)
        .and((item) => item.item_status === 'pending')
        .modify({ item_status: 'cancelled' });
      await enqueue('orders', 'cancel-pending:POST', { orderId });
      return { orderId };
    },
    onSuccess: invalidate('kitchen', 'tables'),
  });
}

export function useUpdateItemStatus() {
  return useMutation({
    mutationFn: async ({ orderId, itemId, status, actionType, cancelReason }) => {
      if (navigator.onLine) {
        try {
          const { data } = await api.patch(`/orders/${orderId}/items/${itemId}/status`, { status, actionType, cancelReason });
          return data;
        } catch (err) {
          if (err.response) throw err;
        }
      }
      await db.kitchen.update(itemId, { item_status: status });
      await enqueue('orders', 'items:PATCH', { orderId, itemId, status, actionType, cancelReason });
      return { orderId, itemId, status };
    },
    onSuccess: invalidate('kitchen', 'tables'),
  });
}

export function useAddItems() {
  return useMutation({
    mutationFn: async ({ orderId, items }) => {
      if (navigator.onLine) {
        try {
          const { data } = await api.post(`/orders/${orderId}/items`, { items });
          return data;
        } catch (err) {
          if (err.response) throw err;
        }
      }
      await enqueue('orders', 'items:POST', { orderId, items });
      return { orderId, items };
    },
    onSuccess: invalidate('kitchen'),
  });
}

export function useAssignStaff() {
  return useMutation({
    mutationFn: async ({ orderId, staffId }) => {
      const { data } = await api.patch(`/orders/${orderId}/assign`, { staffId: staffId ?? null });
      return data;
    },
    onSuccess: invalidate('kitchen', ['orders', 'table']),
  });
}

export function useLinkCustomerToOrder() {
  return useMutation({
    mutationFn: async ({ orderId, loyaltyCustomerId }) => {
      const { data } = await api.patch(`/orders/${orderId}/customer`, { loyaltyCustomerId: loyaltyCustomerId || null });
      return data;
    },
    onSuccess: invalidate('kitchen'),
  });
}

export function useUpdateOrderStatus() {
  return useMutation({
    mutationFn: async ({ id, status }) => {
      if (navigator.onLine) {
        try {
          const { data } = await api.patch(`/orders/${id}/status`, { status });
          return data;
        } catch (err) {
          if (err.response) throw err;
        }
      }
      await enqueue('orders', 'PATCH', { id, status });
      return { id, status };
    },
    onSuccess: invalidate('kitchen', 'orders', 'tables'),
  });
}
