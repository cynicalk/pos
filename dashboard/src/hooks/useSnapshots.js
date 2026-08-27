import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

/**
 * How much trading history has actually been collected.
 *
 * Every field here is measured server-side from closed days in
 * `daily_snapshots` — nothing is projected or rounded up. It is what the
 * `collecting` shells display instead of a placeholder chart.
 */
export function useSnapshotCoverage() {
  return useQuery({
    queryKey: ['snapshots', 'coverage'],
    queryFn: async () => {
      const { data } = await api.get('/snapshots/coverage');
      return data;
    },
    enabled: !!localStorage.getItem('pos_user'),
    staleTime: 60 * 60_000, // moves once a day at most
  });
}
