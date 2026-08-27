import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

// Everything here derives from orders already taken — it moves at the pace of
// trading, not of interaction, so a generous staleTime is right.
const common = {
  enabled: !!localStorage.getItem('pos_user'),
  staleTime: 10 * 60_000,
};

const get = (path, params) => async () => {
  const { data } = await api.get(path, { params });
  return data;
};

export const useEconomics = (days = 30) =>
  useQuery({ queryKey: ['insights', 'economics', days], queryFn: get('/insights/economics', { days }), ...common });

export const useMenuInsights = (days = 30) =>
  useQuery({ queryKey: ['insights', 'menu', days], queryFn: get('/insights/menu', { days }), ...common });

export const useCrossSell = (days = 30) =>
  useQuery({ queryKey: ['insights', 'cross-sell', days], queryFn: get('/insights/cross-sell', { days }), ...common });

export const useNewItems = () =>
  useQuery({ queryKey: ['insights', 'new-items'], queryFn: get('/insights/new-items'), ...common });

export const useServiceHours = (days = 30) =>
  useQuery({ queryKey: ['insights', 'service-hours', days], queryFn: get('/insights/service-hours', { days }), ...common });
