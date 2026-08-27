import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { invalidate } from '../lib/queryClient';

export function useCoupons({ includeInactive = false } = {}) {
  return useQuery({
    queryKey: ['coupons', { includeInactive }],
    queryFn: () =>
      api.get('/coupons', { params: { includeInactive } }).then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useCoupon(id) {
  return useQuery({
    queryKey: ['coupons', id],
    queryFn: () => api.get(`/coupons/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function usePreviewCoupon() {
  return useMutation({
    mutationFn: ({ code, subtotal }) =>
      api.get('/coupons/preview', { params: { code, subtotal } }).then((r) => r.data),
  });
}

export function useCreateCoupon() {
  return useMutation({
    mutationFn: (body) => api.post('/coupons', body).then((r) => r.data),
    onSuccess: invalidate('coupons'),
  });
}

export function useUpdateCoupon() {
  return useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/coupons/${id}`, body).then((r) => r.data),
    onSuccess: invalidate('coupons'),
  });
}

export function useDeleteCoupon() {
  return useMutation({
    mutationFn: (id) => api.delete(`/coupons/${id}`),
    onSuccess: invalidate('coupons'),
  });
}

export function useApplyCoupon(orderId) {
  return useMutation({
    mutationFn: (code) => api.patch(`/orders/${orderId}/coupon`, { code }).then((r) => r.data),
    onSuccess: invalidate(['order', orderId]),
  });
}

export function useRemoveCoupon(orderId) {
  return useMutation({
    mutationFn: () => api.delete(`/orders/${orderId}/coupon`).then((r) => r.data),
    onSuccess: invalidate(['order', orderId]),
  });
}
