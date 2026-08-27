import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { invalidate } from '../lib/queryClient';

export function useShiftSummary() {
  return useQuery({
    queryKey: ['shift-summary'],
    queryFn: () => api.get('/shift/summary').then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useShiftHistory() {
  return useQuery({
    queryKey: ['shift-history'],
    queryFn: () => api.get('/shift/history').then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useShiftFullHistory() {
  return useQuery({
    queryKey: ['shift-history-full'],
    queryFn: () => api.get('/shift/history?limit=500').then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useRecordShiftCount() {
  return useMutation({
    mutationFn: (data) => api.post('/shift/count', data).then((r) => r.data),
    onSuccess: invalidate('shift-summary', 'shift-history'),
  });
}
