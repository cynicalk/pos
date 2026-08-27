import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { invalidate } from '../lib/queryClient';

export function useIngredients(options = {}) {
  return useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => {
      const { data } = await api.get('/ingredients');
      return data;
    },
    ...options,
  });
}

export function useLowStock() {
  return useQuery({
    queryKey: ['ingredients', 'low-stock'],
    queryFn: async () => {
      const { data } = await api.get('/ingredients/low-stock');
      return data;
    },
  });
}

export function useCreateIngredient() {
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/ingredients', body);
      return data;
    },
    onSuccess: invalidate('ingredients'),
  });
}

export function useUpdateIngredient() {
  return useMutation({
    mutationFn: async ({ id, ...fields }) => {
      const { data } = await api.patch(`/ingredients/${id}`, fields);
      return data;
    },
    onSuccess: invalidate('ingredients'),
  });
}

export function useRecordPurchase() {
  return useMutation({
    mutationFn: async ({ id, ...body }) => {
      const { data } = await api.post(`/ingredients/${id}/purchase`, body);
      return data;
    },
    onSuccess: invalidate('ingredients'),
  });
}
