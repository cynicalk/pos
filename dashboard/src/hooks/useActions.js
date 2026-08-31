import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { queryClient } from '../lib/queryClient';

// `enabled` is not a nicety: GET /actions is admin-only, and Overview renders
// for every role. Without it a cashier's dashboard fires a request that can only
// ever come back 403.
export function useActions(status, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['actions', status || 'all'],
    queryFn: async () => {
      const { data } = await api.get('/actions', { params: status ? { status } : {} });
      return data;
    },
    enabled: enabled && !!localStorage.getItem('pos_user'),
    // The rules scheduler runs every 15 minutes; refetch on the same order so a
    // stalled table shows up while the party is still there.
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

// The AI-narrated plan over the ranked open actions. Narrates through the local
// model, so it gets the long timeout; admin-only like the list itself.
export function useActionBrief({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['actions', 'brief'],
    queryFn: async () => (await api.get('/actions/brief', { timeout: 20_000 })).data,
    enabled: enabled && !!localStorage.getItem('pos_user'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useEvaluateActions() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/actions/evaluate');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['actions'] }),
  });
}

export function useSetActionStatus() {
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const { data } = await api.patch(`/actions/${id}/status`, { status });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['actions'] }),
  });
}
