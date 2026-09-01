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

export const useCouponEconomics = (days = 30) =>
  useQuery({ queryKey: ['insights', 'coupon-economics', days], queryFn: get('/insights/coupon-economics', { days }), ...common });

export const useAttachRate = (days = 30) =>
  useQuery({ queryKey: ['insights', 'attach', days], queryFn: get('/insights/attach', { days }), ...common });

export const useRecoPerformance = (days = 30) =>
  useQuery({ queryKey: ['insights', 'reco-performance', days], queryFn: get('/insights/reco-performance', { days }), ...common });

export const useStaffPerformance = (days = 30) =>
  useQuery({ queryKey: ['insights', 'staff', days], queryFn: get('/insights/staff', { days }), ...common });
