import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { queryClient } from '../lib/queryClient';

const common = {
  enabled: !!localStorage.getItem('pos_user'),
  staleTime: 5 * 60_000,
};

const get = (path) => async () => {
  const { data } = await api.get(path);
  return data;
};

// Anything that changes stock, prices or orders invalidates the lot: a received
// delivery moves the reorder positions and the suggestions at the same time.
const invalidateAll = () => {
  queryClient.invalidateQueries({ queryKey: ['procurement'] });
  queryClient.invalidateQueries({ queryKey: ['insights'] });
};

export const useSuppliers = () =>
  useQuery({ queryKey: ['procurement', 'suppliers'], queryFn: get('/procurement/suppliers'), ...common });

export const useReorder = () =>
  useQuery({ queryKey: ['procurement', 'reorder'], queryFn: get('/procurement/reorder'), ...common });

export const useSuggestions = () =>
  useQuery({ queryKey: ['procurement', 'suggestions'], queryFn: get('/procurement/suggestions'), ...common });

export const usePurchaseOrders = () =>
  useQuery({ queryKey: ['procurement', 'orders'], queryFn: get('/procurement/orders'), ...common });

export const useCreateSupplier = () =>
  useMutation({
    mutationFn: async (body) => (await api.post('/procurement/suppliers', body)).data,
    onSuccess: invalidateAll,
  });

export const useAssignSupplier = () =>
  useMutation({
    mutationFn: async ({ ingredientId, supplierId }) =>
      (await api.patch(`/procurement/ingredients/${ingredientId}/supplier`, { supplierId })).data,
    onSuccess: invalidateAll,
  });

export const useCreatePurchaseOrder = () =>
  useMutation({
    mutationFn: async (body) => (await api.post('/procurement/orders', body)).data,
    onSuccess: invalidateAll,
  });

export const useReceivePurchaseOrder = () =>
  useMutation({
    mutationFn: async (id) => (await api.post(`/procurement/orders/${id}/receive`)).data,
    onSuccess: invalidateAll,
  });

export const useImportInvoice = () =>
  useMutation({
    mutationFn: async (csv) => (await api.post('/procurement/invoice', { csv })).data,
    onSuccess: invalidateAll,
  });

// ── Labour ─────────────────────────────────────────────────────────────────

export const useStaffRates = () =>
  useQuery({ queryKey: ['procurement', 'rates'], queryFn: get('/labour/rates'), ...common });

export const useShifts = () =>
  useQuery({ queryKey: ['procurement', 'shifts'], queryFn: get('/labour/shifts'), ...common });

export const useShiftReview = () =>
  useQuery({ queryKey: ['procurement', 'shift-review'], queryFn: get('/labour/review'), ...common });

export const useSetStaffRate = () =>
  useMutation({
    mutationFn: async ({ userId, hourlyRate }) =>
      (await api.patch(`/labour/rates/${userId}`, { hourlyRate })).data,
    onSuccess: invalidateAll,
  });

export const useLogShift = () =>
  useMutation({
    mutationFn: async (body) => (await api.post('/labour/shifts', body)).data,
    onSuccess: invalidateAll,
  });
