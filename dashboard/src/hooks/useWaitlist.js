import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { invalidate } from '../lib/queryClient';

// Live walk-in queue with per-party ETA + position (server recomputes on read).
export function useWaitlistQueue() {
  return useQuery({
    queryKey: ['waitlist'],
    queryFn: async () => {
      const { data } = await api.get('/waitlist');
      return data;
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}

// Current restaurant — used here for the door-QR public_token.
export function useRestaurant() {
  return useQuery({
    queryKey: ['restaurant'],
    queryFn: async () => {
      const { data } = await api.get('/restaurants/current');
      return data;
    },
    staleTime: 10 * 60_000,
  });
}

export function useAddWalkIn() {
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/waitlist', body);
      return data;
    },
    onSuccess: invalidate('waitlist', 'tables'),
  });
}

export function useSeatParty() {
  return useMutation({
    mutationFn: async ({ id, tableId }) => {
      const { data } = await api.post(`/waitlist/${id}/seat`, { tableId });
      return data;
    },
    onSuccess: invalidate('waitlist', 'tables'),
  });
}

export function useCancelParty() {
  return useMutation({
    mutationFn: async (id) => {
      const { data } = await api.post(`/waitlist/${id}/cancel`);
      return data;
    },
    onSuccess: invalidate('waitlist', 'tables'),
  });
}

export function useNoShowParty() {
  return useMutation({
    mutationFn: async (id) => {
      const { data } = await api.post(`/waitlist/${id}/no-show`);
      return data;
    },
    onSuccess: invalidate('waitlist', 'tables'),
  });
}
