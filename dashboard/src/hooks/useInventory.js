import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { invalidate } from '../lib/queryClient';
import { useTimezone } from '../context/TimezoneContext';

export function useInventoryTransactions({ ingredientId, type, from, to, limit } = {}) {
  // from/to are local (restaurant-tz) dates, so tell the backend which zone to
  // bucket created_at into — otherwise the date window is off near midnight.
  const { iana } = useTimezone();
  return useQuery({
    queryKey: ['inventory-transactions', ingredientId, type, from, to, limit, iana],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (ingredientId) params.set('ingredientId', ingredientId);
      if (type)         params.set('type', type);
      if (from)         params.set('from', from);
      if (to)           params.set('to', to);
      if (limit)        params.set('limit', limit);
      params.set('tz', iana);
      const { data } = await api.get(`/inventory/transactions?${params}`);
      return data;
    },
  });
}

export function useWasteReport(from, to) {
  const { iana } = useTimezone();
  return useQuery({
    queryKey: ['waste-report', from, to, iana],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to)   params.set('to', to);
      params.set('tz', iana);
      const { data } = await api.get(`/inventory/waste-report?${params}`);
      return data;
    },
  });
}

export function useImportLedger() {
  return useMutation({
    mutationFn: async (rows) => {
      const { data } = await api.post('/inventory/import', { rows });
      return data;
    },
    onSuccess: invalidate('ingredients', 'inventory-transactions'),
  });
}

export function useRecordAdjustment() {
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/inventory/adjustment', body);
      return data;
    },
    onSuccess: invalidate('ingredients', 'inventory-transactions'),
  });
}
