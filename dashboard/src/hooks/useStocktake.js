import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { invalidate } from '../lib/queryClient';

export function useStockCounts() {
  return useQuery({
    queryKey: ['stocktake'],
    queryFn: async () => (await api.get('/stocktake')).data,
  });
}

export function useStockCount(id) {
  return useQuery({
    queryKey: ['stocktake', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get(`/stocktake/${id}`)).data,
  });
}

export function useCreateStockCount() {
  return useMutation({
    mutationFn: async (body) => (await api.post('/stocktake', body)).data,
    onSuccess: invalidate('stocktake'),
  });
}

export function useSaveStockCountLines() {
  return useMutation({
    mutationFn: async ({ id, lines }) => (await api.patch(`/stocktake/${id}/lines`, { lines })).data,
    onSuccess: invalidate('stocktake'),
  });
}

export function useFinalizeStockCount() {
  return useMutation({
    // reconcile=true posts ADJUSTMENT txns so stock_on_hand matches the count
    mutationFn: async ({ id, reconcile }) => (await api.post(`/stocktake/${id}/finalize`, { reconcile })).data,
    onSuccess: invalidate('stocktake', 'ingredients'),
  });
}

export function useImportStockCount() {
  return useMutation({
    mutationFn: async ({ id, rows }) => (await api.post(`/stocktake/${id}/import`, { rows })).data,
    onSuccess: invalidate('stocktake'),
  });
}

export function useDeleteStockCount() {
  return useMutation({
    mutationFn: async (id) => { await api.delete(`/stocktake/${id}`); },
    onSuccess: invalidate('stocktake'),
  });
}
