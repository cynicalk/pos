import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { invalidate } from '../lib/queryClient';

export function useLoyaltyCustomers(search = '') {
  return useQuery({
    queryKey: ['loyalty-customers', search],
    queryFn: () =>
      api.get('/loyalty/customers', { params: search ? { search } : {} }).then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useLoyaltyCustomer(id) {
  return useQuery({
    queryKey: ['loyalty-customer', id],
    queryFn: () => api.get(`/loyalty/customers/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useLoyaltyTransactions(id) {
  return useQuery({
    queryKey: ['loyalty-transactions', id],
    queryFn: () => api.get(`/loyalty/customers/${id}/transactions`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useLookupLoyaltyCustomer() {
  return useMutation({
    mutationFn: (phone) =>
      api.get('/loyalty/customers/lookup', { params: { phone } }).then((r) => r.data),
  });
}

export function useCreateLoyaltyCustomer() {
  return useMutation({
    mutationFn: (body) => api.post('/loyalty/customers', body).then((r) => r.data),
    onSuccess: invalidate('loyalty-customers'),
  });
}

export function useAdjustPoints(customerId) {
  return useMutation({
    mutationFn: ({ points, description }) =>
      api.patch(`/loyalty/customers/${customerId}/adjust`, { points, description }).then((r) => r.data),
    onSuccess: invalidate(
      ['loyalty-customer', customerId],
      ['loyalty-transactions', customerId],
      'loyalty-customers',
    ),
  });
}

export function useApplyLoyalty(orderId) {
  return useMutation({
    mutationFn: ({ phone, pointsToRedeem }) =>
      api.patch(`/orders/${orderId}/loyalty`, { phone, pointsToRedeem }).then((r) => r.data),
    onSuccess: invalidate(['bill', orderId]),
  });
}

export function useDeleteLoyaltyCustomer() {
  return useMutation({
    mutationFn: (id) => api.delete(`/loyalty/customers/${id}`).then((r) => r.data),
    onSuccess: invalidate('loyalty-customers'),
  });
}

export function useUpdateLoyaltyCustomerName() {
  return useMutation({
    mutationFn: ({ id, name }) => api.patch(`/loyalty/customers/${id}`, { name }).then((r) => r.data),
    onSuccess: invalidate('loyalty-customers'),
  });
}

export function useRemoveLoyalty(orderId) {
  return useMutation({
    mutationFn: () => api.delete(`/orders/${orderId}/loyalty`).then((r) => r.data),
    onSuccess: invalidate(['bill', orderId]),
  });
}

export function useLoyaltyTiers() {
  return useQuery({
    queryKey: ['loyalty-tiers'],
    queryFn: () => api.get('/loyalty/tiers').then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useLoyaltyRewards() {
  return useQuery({
    queryKey: ['loyalty-rewards'],
    queryFn: () => api.get('/loyalty/rewards').then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useSaveLoyaltyTiers() {
  return useMutation({
    mutationFn: (tiers) => api.put('/loyalty/tiers', tiers).then((r) => r.data),
    onSuccess: invalidate('loyalty-tiers'),
  });
}

export function useSaveLoyaltyRewards() {
  return useMutation({
    mutationFn: (rewards) => api.put('/loyalty/rewards', rewards).then((r) => r.data),
    onSuccess: invalidate('loyalty-rewards'),
  });
}
