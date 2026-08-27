import { useQuery, useMutation } from '@tanstack/react-query';
import { db, dbMeta } from '../db';
import api from '../api/client';
import { enqueue } from '../store/syncQueue';
import { queryClient } from '../lib/queryClient';

export function useMenuItems() {
  return useQuery({
    queryKey: ['menu'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/menu');
        await db.menu.bulkPut(data);
        await dbMeta.setLastSync('menu');
        return data;
      } catch {
        return db.menu.orderBy('category').toArray();
      }
    },
  });
}

export function usePopularMenuItems(limit = 6) {
  return useQuery({
    queryKey: ['menu-popular', limit],
    queryFn: async () => {
      try {
        const { data } = await api.get('/menu/popular');
        return data;
      } catch {
        return [];
      }
    },
  });
}

export function useCreateMenuItem() {
  return useMutation({
    mutationFn: async (item) => {
      if (navigator.onLine) {
        try {
          const { data } = await api.post('/menu', item);
          await db.menu.put(data);
          return data;
        } catch (err) {
          if (err.response) throw err;
        }
      }
      const local = { ...item, id: `local_${crypto.randomUUID()}`, available: true };
      await db.menu.put(local);
      await enqueue('menu', 'POST', item, local.id);
      return local;
    },
    onSuccess: (newItem) => {
      queryClient.setQueryData(['menu'], (old) =>
        old ? [...old, newItem] : [newItem],
      );
    },
  });
}

export function useUpdateMenuItem() {
  return useMutation({
    mutationFn: async ({ id, ...fields }) => {
      await db.menu.update(id, fields);
      if (navigator.onLine) {
        try {
          const { data } = await api.patch(`/menu/${id}`, fields);
          await db.menu.put(data);
          return data;
        } catch (err) {
          if (err.response) throw err;
        }
      }
      await enqueue('menu', 'PATCH', { id, ...fields });
      return { id, ...fields };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['menu'], (old) => {
        if (!old) return old;
        return old.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        );
      });
    },
  });
}

export function useDeleteMenuItem() {
  return useMutation({
    mutationFn: async (id) => {
      await db.menu.delete(id);
      if (navigator.onLine) {
        try {
          await api.delete(`/menu/${id}`);
          return id;
        } catch (err) {
          if (err.response) throw err;
        }
      }
      await enqueue('menu', 'DELETE', { id });
      return id;
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData(['menu'], (old) =>
        old ? old.filter((item) => item.id !== deletedId) : [],
      );
    },
  });
}
