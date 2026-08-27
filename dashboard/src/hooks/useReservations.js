import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { invalidate } from '../lib/queryClient';
import { useTimezone } from '../context/TimezoneContext';

export function useReservations(date) {
  // `date` is a local (restaurant-tz) calendar day; pass the zone so reserved_at
  // is matched on the same day rather than its UTC date.
  const { iana } = useTimezone();
  return useQuery({
    queryKey: ['reservations', date, iana],
    queryFn: async () => {
      const { data } = await api.get('/reservations', { params: { ...(date ? { date } : {}), tz: iana } });
      return data;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useCreateReservation() {
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/reservations', body);
      return data;
    },
    onSuccess: invalidate('reservations', 'tables'),
  });
}

export function useUpdateReservation() {
  return useMutation({
    mutationFn: async ({ id, ...body }) => {
      const { data } = await api.patch(`/reservations/${id}`, body);
      return data;
    },
    onSuccess: invalidate('reservations', 'tables'),
  });
}

export function useDeleteReservation() {
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/reservations/${id}`);
    },
    onSuccess: invalidate('reservations', 'tables'),
  });
}

export function useSeatReservation() {
  return useMutation({
    mutationFn: async (id) => {
      const { data } = await api.post(`/reservations/${id}/seat`);
      return data;
    },
    onSuccess: invalidate('reservations', 'tables'),
  });
}

export function useCancelReservation() {
  return useMutation({
    mutationFn: async (id) => {
      const { data } = await api.post(`/reservations/${id}/cancel`);
      return data;
    },
    onSuccess: invalidate('reservations', 'tables'),
  });
}

export function useNoShowReservation() {
  return useMutation({
    mutationFn: async (id) => {
      const { data } = await api.post(`/reservations/${id}/no-show`);
      return data;
    },
    onSuccess: invalidate('reservations', 'tables'),
  });
}
