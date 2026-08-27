import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { useTimezone } from '../context/TimezoneContext';

export function useReviews({ from, to, rating, enabled = true } = {}) {
  const { iana } = useTimezone();
  return useQuery({
    queryKey: ['reviews', from, to, rating, iana],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams({ timezone: iana });
      if (from)   params.set('from', from);
      if (to)     params.set('to', to);
      if (rating) params.set('rating', rating);
      const { data } = await api.get(`/reviews?${params}`);
      return data;
    },
    staleTime: 60_000,
  });
}
