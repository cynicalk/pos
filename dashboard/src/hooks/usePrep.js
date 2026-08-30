import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { queryClient } from '../lib/queryClient';

const common = {
  enabled: !!localStorage.getItem('pos_user'),
  staleTime: 2 * 60_000,
};

export const usePrepPlan = (date) =>
  useQuery({
    queryKey: ['prep', 'plan', date ?? null],
    queryFn: async () => (await api.get(`/prep/plan${date ? `?date=${date}` : ''}`)).data,
    ...common,
  });

export const usePrepReconciliation = (date) =>
  useQuery({
    queryKey: ['prep', 'reconciliation', date ?? null],
    queryFn: async () => (await api.get(`/prep/reconciliation${date ? `?date=${date}` : ''}`)).data,
    ...common,
  });

// Phase 2 — the forward over-prep forecast for the next service (or a given date).
export const usePrepForecast = (date) =>
  useQuery({
    queryKey: ['prep', 'forecast', date ?? null],
    queryFn: async () => (await api.get(`/prep/forecast${date ? `?date=${date}` : ''}`)).data,
    ...common,
  });

const invalidate = () => {
  queryClient.invalidateQueries({ queryKey: ['prep'] });
};

export const useSavePrepPlan = () =>
  useMutation({
    mutationFn: async ({ date, entries }) => (await api.post('/prep/plan', { date, entries })).data,
    onSuccess: invalidate,
  });

export const useSavePrepActual = () =>
  useMutation({
    mutationFn: async ({ date, entries }) => (await api.post('/prep/actual', { date, entries })).data,
    onSuccess: invalidate,
  });
