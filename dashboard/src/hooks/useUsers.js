import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { invalidate } from '../lib/queryClient';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/auth/users');
      return data;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useCreateUser() {
  return useMutation({
    mutationFn: async ({ email, role, name }) => {
      const { data } = await api.post('/auth/register', { email, role, name: name || undefined });
      return data;
    },
    onSuccess: invalidate('users'),
  });
}

export function useDeleteUser() {
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/auth/users/${id}`);
    },
    onSuccess: invalidate('users'),
  });
}

export function useUpdateUserRole() {
  return useMutation({
    mutationFn: async ({ id, role }) => {
      const { data } = await api.patch(`/auth/users/${id}/role`, { role });
      return data;
    },
    onSuccess: invalidate('users'),
  });
}

export function useMeProfile() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data } = await api.get('/auth/me');
      return data;
    },
    staleTime: 0,
  });
}

export function useUpdateUserName() {
  return useMutation({
    mutationFn: async ({ id, name }) => {
      const { data } = await api.patch(`/auth/users/${id}/name`, { name: name || null });
      return data;
    },
    onSuccess: invalidate('users'),
  });
}

export function useSetUserActive() {
  return useMutation({
    mutationFn: async ({ id, isActive }) => {
      const { data } = await api.patch(`/auth/users/${id}/active`, { is_active: isActive });
      return data;
    },
    onSuccess: invalidate('users'),
  });
}

export function useSetUserPresent() {
  return useMutation({
    mutationFn: async ({ id, isPresent }) => {
      const { data } = await api.patch(`/auth/users/${id}/present`, { is_present: isPresent });
      return data;
    },
    onSuccess: invalidate('users', 'me'),
  });
}

export function useSetStaffPin() {
  return useMutation({
    mutationFn: async ({ id, pin }) => {
      const { data } = await api.patch(`/auth/users/${id}/pin`, { pin: pin ?? '' });
      return data;
    },
    onSuccess: invalidate('users', 'me'),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: async (id) => {
      const { data } = await api.post(`/auth/users/${id}/resend-verification`);
      return data;
    },
  });
}
