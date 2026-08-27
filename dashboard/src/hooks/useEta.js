import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

// ETA config + effective category weights (read side of the Phase-1 estimator).
export function useEtaConfig() {
  return useQuery({
    queryKey: ['eta-config'],
    queryFn: async () => {
      const { data } = await api.get('/eta/config');
      return data;
    },
    enabled: !!localStorage.getItem('pos_user'),
    staleTime: 60_000,
  });
}
