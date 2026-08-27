import { useQuery, useMutation } from '@tanstack/react-query';
import { db, dbMeta } from '../db';
import api from '../api/client';
import { enqueue } from '../store/syncQueue';
import { queryClient } from '../lib/queryClient';

export function useTables() {
  return useQuery({
    queryKey: ['tables'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/tables');
        await db.restaurant_tables.bulkPut(data);
        await dbMeta.setLastSync('tables');
        return data;
      } catch {
        return db.restaurant_tables.orderBy('number').toArray();
      }
    },
  });
}

export function useUpdateTableStatus() {
  return useMutation({
    mutationFn: async ({ id, status, reservation }) => {
      await db.restaurant_tables.update(id, { status });
      if (navigator.onLine) {
        try {
          const { data } = await api.patch(`/tables/${id}/status`, { status, reservation: reservation ?? null });
          await db.restaurant_tables.put(data);
          return data;
        } catch (err) {
          if (err.response) throw err;
        }
      }
      await enqueue('tables', 'PATCH', { id, status });
      return { id, status };
    },
    onSuccess: (updatedTable) => {
      queryClient.setQueryData(['tables'], (old) => {
        if (!old) return old;
        return old.map((t) =>
          t.id === updatedTable.id ? { ...t, ...updatedTable } : t,
        );
      });
    },
  });
}

export function useUpdateTablePosition() {
  return useMutation({
    mutationFn: async ({ id, x, y }) => {
      const { data } = await api.patch(`/tables/${id}/position`, { x, y });
      return data;
    },
    onMutate: async ({ id, x, y }) => {
      await queryClient.cancelQueries({ queryKey: ['tables'] });
      const prev = queryClient.getQueryData(['tables']);
      queryClient.setQueryData(['tables'], (old) =>
        old?.map((t) => (t.id === id ? { ...t, x_pos: x ?? null, y_pos: y ?? null } : t)) ?? old,
      );
      return { prev };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tables'], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
  });
}

export function useAssignTableStaff() {
  return useMutation({
    mutationFn: async ({ tableId, staffId }) => {
      const { data } = await api.patch(`/tables/${tableId}/assign`, { staffId: staffId ?? null });
      return data;
    },
    onSuccess: (updatedTable) => {
      queryClient.setQueryData(['tables'], (old) =>
        old?.map((t) => (t.id === updatedTable.id ? { ...t, ...updatedTable } : t)) ?? old,
      );
    },
  });
}

export function useCreateTable() {
  return useMutation({
    mutationFn: async (table) => {
      if (navigator.onLine) {
        try {
          const { data } = await api.post('/tables', table);
          await db.restaurant_tables.put(data);
          return data;
        } catch (err) {
          if (err.response) throw err;
        }
      }
      const local = { ...table, id: `local_${crypto.randomUUID()}`, status: 'available' };
      await db.restaurant_tables.put(local);
      await enqueue('tables', 'POST', table, local.id);
      return local;
    },
    onSuccess: (newTable) => {
      queryClient.setQueryData(['tables'], (old) =>
        old ? [...old, newTable].sort((a, b) => a.number - b.number) : [newTable],
      );
    },
  });
}
