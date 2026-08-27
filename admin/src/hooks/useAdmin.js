import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

// ── Restaurants ───────────────────────────────────────────────────────────────

export function useRestaurants() {
  return useQuery({
    queryKey: ['restaurants'],
    queryFn: () => api.get('/restaurants').then((r) => r.data),
  });
}

export function useRestaurant(id) {
  return useQuery({
    queryKey: ['restaurants', id],
    queryFn: () => api.get(`/restaurants/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCreateRestaurant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name) => api.post('/restaurants', { name }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurants'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useUpdateRestaurant(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name) => api.patch(`/restaurants/${id}`, { name }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurants'] });
      qc.invalidateQueries({ queryKey: ['restaurants', id] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useDeleteRestaurant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/restaurants/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurants'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useSetRestaurantStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_active }) =>
      api.patch(`/restaurants/${id}/status`, { is_active }).then((r) => r.data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['restaurants'] });
      qc.invalidateQueries({ queryKey: ['restaurants', id] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useSetRestaurantAi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ai_enabled }) =>
      api.patch(`/restaurants/${id}/ai`, { ai_enabled }).then((r) => r.data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['restaurants'] });
      qc.invalidateQueries({ queryKey: ['restaurants', id] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useRegenerateTableTokens(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/restaurants/${id}/regenerate-qr`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurants', id] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

// ── Users ─────────────────────────────────────────────────────────────────────

export function useCreateUser(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      api.post(`/restaurants/${restaurantId}/users`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurants', restaurantId] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useDeleteUser(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId) => api.delete(`/restaurants/${restaurantId}/users/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurants', restaurantId] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

// ── Super admins ──────────────────────────────────────────────────────────────

export function useSuperAdmins() {
  return useQuery({
    queryKey: ['super-admins'],
    queryFn: () => api.get('/super-admins').then((r) => r.data),
  });
}

export function useCreateSuperAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post('/super-admins', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admins'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useDeleteSuperAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/super-admins/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admins'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useUpdateSuperAdminRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }) => api.patch(`/super-admins/${id}/role`, { role }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admins'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useResendSuperAdminVerification() {
  return useMutation({
    mutationFn: (id) => api.post(`/super-admins/${id}/resend-verification`).then((r) => r.data),
  });
}

// ── Audit logs ────────────────────────────────────────────────────────────────

export function useAuditLogs({ restaurantId, from, to, resourceType, limit = 500 }) {
  return useQuery({
    queryKey: ['audit-logs', restaurantId, from, to, resourceType, limit],
    queryFn: () => {
      const params = new URLSearchParams();
      if (restaurantId) params.set('restaurantId', restaurantId);
      if (from)         params.set('from', from);
      if (to)           params.set('to', to);
      if (resourceType) params.set('resourceType', resourceType);
      params.set('limit', limit);
      return api.get(`/audit-logs?${params}`).then((r) => r.data);
    },
    staleTime: 30_000,
  });
}

// ── Auth / profile ───────────────────────────────────────────────────────────

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }) =>
      api.post('/auth/change-password', { currentPassword, newPassword }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-logs'] }),
  });
}

export function useUpdateDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (defaults) => api.patch('/auth/me/defaults', defaults).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

// ── Logo ──────────────────────────────────────────────────────────────────────

export function useUploadLogo(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('logo', file);
      const { data } = await api.post(`/restaurants/${restaurantId}/logo`, form);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['restaurants', restaurantId] }),
  });
}

export function useDeleteLogo(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/restaurants/${restaurantId}/logo`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['restaurants', restaurantId] }),
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function useUpdateSetting(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }) =>
      api.patch(`/restaurants/${restaurantId}/settings`, { key, value }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurants', restaurantId] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}
