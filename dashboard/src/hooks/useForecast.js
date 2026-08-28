import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

// Admin-only endpoints, and the forecast is recomputed from snapshots on every
// call — cheap, but there is no point refetching it more than once a session.
// A seasonal-naive forecast does not change until tomorrow's snapshot lands.
const common = {
  enabled: !!localStorage.getItem('pos_user'),
  staleTime: 10 * 60_000,
};

const get = (path) => async () => {
  const { data } = await api.get(path);
  return data;
};

const withDate = (path, date) => (date ? `${path}?date=${date}` : path);

export const useDemandForecast = (date) =>
  useQuery({
    queryKey: ['forecast', 'demand', date ?? null],
    queryFn: get(withDate('/forecast/demand', date)),
    ...common,
  });

export const usePrepSheet = (date) =>
  useQuery({
    queryKey: ['forecast', 'prep', date ?? null],
    queryFn: get(withDate('/forecast/prep-sheet', date)),
    ...common,
  });

export const useCapacity = (date) =>
  useQuery({
    queryKey: ['forecast', 'capacity', date ?? null],
    queryFn: get(withDate('/forecast/capacity', date)),
    ...common,
  });

export const useInventoryForecast = (date) =>
  useQuery({
    queryKey: ['forecast', 'inventory', date ?? null],
    queryFn: get(withDate('/forecast/inventory', date)),
    ...common,
  });

export const useReorderPlan = (date) =>
  useQuery({
    queryKey: ['forecast', 'reorder', date ?? null],
    queryFn: get(withDate('/forecast/reorder', date)),
    ...common,
  });

export const useShiftPlan = (date) =>
  useQuery({
    queryKey: ['forecast', 'shift-plan', date ?? null],
    queryFn: get(withDate('/forecast/shift-plan', date)),
    ...common,
  });

export const useScheduling = (date) =>
  useQuery({
    queryKey: ['forecast', 'scheduling', date ?? null],
    queryFn: get(withDate('/forecast/scheduling', date)),
    ...common,
  });
