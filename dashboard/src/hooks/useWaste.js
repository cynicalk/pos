import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { invalidate } from '../lib/queryClient';
import { useTimezone } from '../context/TimezoneContext';

export function useWastageReviews(status) {
  return useQuery({
    queryKey: ['wastage-reviews', status],
    queryFn: async () => {
      const params = status ? `?status=${status}` : '';
      const { data } = await api.get(`/wastage-reviews${params}`);
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function useResolveWastageReview() {
  return useMutation({
    mutationFn: async ({ id, ingredients }) => {
      const { data } = await api.post(`/wastage-reviews/${id}/resolve`, { ingredients });
      return data;
    },
    onSuccess: invalidate('wastage-reviews', 'waste', 'ingredients'),
  });
}

export function useWasteLogs(from, to) {
  // from/to are local (restaurant-tz) calendar dates, so the backend must filter
  // logged_at in the same zone — otherwise early-local-morning waste (when UTC is
  // still "yesterday") drops out of a [today, today] window.
  const { iana } = useTimezone();
  return useQuery({
    queryKey: ['waste', from, to, iana],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to)   params.set('to', to);
      params.set('tz', iana);
      const { data } = await api.get(`/waste?${params}`);
      return data;
    },
  });
}

export function useLogWaste() {
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/waste', body);
      return data;
    },
    onSuccess: invalidate('waste', 'ingredients'),
  });
}

export function useLogWasteByMenuItem() {
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/waste/by-menu-item', body);
      return data;
    },
    onSuccess: invalidate('waste', 'ingredients'),
  });
}

// AI waste insights (admin) — latest stored analysis + on-demand regeneration
export function useWasteInsights() {
  return useQuery({
    queryKey: ['waste-insights'],
    queryFn: async () => (await api.get('/waste/insights')).data,
  });
}

export function useGenerateWasteInsight() {
  return useMutation({
    mutationFn: async () => (await api.post('/waste/insights/generate')).data,
    onSuccess: invalidate('waste-insights'),
  });
}
