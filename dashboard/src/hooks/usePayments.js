import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { enqueue } from '../store/syncQueue';
import { invalidate } from '../lib/queryClient';

export function useBill(orderId, { itemIds = null, waiveServiceCharge = false } = {}) {
  const key = itemIds?.length ? itemIds.join(',') : null;
  return useQuery({
    queryKey: ['bill', orderId, key, waiveServiceCharge],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (itemIds?.length) params.set('itemIds', itemIds.join(','));
      if (waiveServiceCharge) params.set('waive', 'true');
      const query = params.toString() ? `?${params}` : '';
      const { data } = await api.get(`/payments/${orderId}/bill${query}`);
      return data;
    },
    enabled: !!orderId,
    staleTime: 30_000,
  });
}

export function useApplyDiscount(orderId) {
  return useMutation({
    mutationFn: async ({ discountType, discountValue }) => {
      const { data } = await api.patch(`/orders/${orderId}/discount`, { discountType, discountValue });
      return data;
    },
    onSuccess: invalidate(['bill', orderId]),
  });
}

export function useProcessPayment() {
  return useMutation({
    mutationFn: async ({ orderId, method, tenders, amountTendered, waiveServiceCharge }) => {
      const body = tenders ? { tenders } : { method };
      if (!tenders && amountTendered !== undefined) body.amountTendered = parseFloat(amountTendered);
      if (waiveServiceCharge) body.waiveServiceCharge = true;

      if (navigator.onLine) {
        try {
          const { data } = await api.post(`/payments/${orderId}`, body);
          return data;
        } catch (err) {
          if (err.response) throw err;
        }
      }
      await enqueue('payments', 'POST', { orderId, ...body });
      return { orderId, status: 'queued' };
    },
    onSuccess: invalidate('kitchen', 'tables', 'order-history', 'loyalty-customers'),
  });
}

export function useProcessSplitPayment() {
  return useMutation({
    mutationFn: async ({ orderId, splits, waiveServiceCharge }) => {
      if (navigator.onLine) {
        try {
          const { data } = await api.post(`/payments/${orderId}/split`, { splits, waiveServiceCharge });
          return data;
        } catch (err) {
          if (err.response) throw err;
        }
      }
      await enqueue('payments', 'split:POST', { orderId, splits, waiveServiceCharge });
      return { orderId, status: 'queued' };
    },
    onSuccess: invalidate('kitchen', 'tables', 'order-history', 'loyalty-customers'),
  });
}
