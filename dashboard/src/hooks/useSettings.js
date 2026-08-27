import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { queryClient } from '../lib/queryClient';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await api.get('/settings');
      return data;
    },
    // Only fetch when a token is present (avoids 401 redirect on login page)
    enabled: !!localStorage.getItem('pos_user'),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateSetting() {
  return useMutation({
    mutationFn: async ({ key, value }) => {
      const { data } = await api.patch('/settings', { key, value });
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
    },
  });
}
