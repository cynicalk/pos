import { useQuery } from '@tanstack/react-query';
import { db } from '../db';
import api from '../api/client';
import { useTimezone } from '../context/TimezoneContext';

// channel === 'all' or undefined → omit param (backend treats absent as NULL = all channels)
function channelParam(channel) {
  return channel && channel !== 'all' ? `&channel=${channel}` : '';
}

export function useDailyReport(date, channel = 'all') {
  const { iana } = useTimezone();
  const dateStr = date || new Intl.DateTimeFormat('en-CA', { timeZone: iana }).format(new Date());

  return useQuery({
    queryKey: ['reports', 'daily', dateStr, iana, channel],
    staleTime: 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      try {
        const { data } = await api.get(
          `/reports/daily?date=${dateStr}&tz=${encodeURIComponent(iana)}${channelParam(channel)}`,
        );
        const parsed = {
          ...data,
          byCategory: data.byCategory?.map((r) => ({ ...r, revenue: parseFloat(r.revenue) })),
          hourly:     data.hourly?.map((r)     => ({ ...r, revenue: parseFloat(r.revenue) })),
          topItems:   data.topItems?.map((r)   => ({ ...r, revenue: parseFloat(r.revenue) })),
        };
        // only cache "all channels" for offline fallback
        if (!channel || channel === 'all') {
          await db.reports.put({ date: dateStr, tz: iana, ...parsed, cached_at: Date.now() });
        }
        return parsed;
      } catch {
        if (!channel || channel === 'all') {
          const cached = await db.reports.get(dateStr);
          if (cached) return cached;
        }
        throw new Error('Report unavailable offline — no cached data for this date');
      }
    },
  });
}

export function useTrends(from, to, group = 'day', channel = 'all') {
  const { iana } = useTimezone();
  const enabled = Boolean(from && to);
  return useQuery({
    queryKey: ['reports', 'trends', from, to, group, iana, channel],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      const { data } = await api.get(
        `/reports/trends?from=${from}&to=${to}&group=${group}&tz=${encodeURIComponent(iana)}${channelParam(channel)}`,
      );
      return data;
    },
  });
}

export function useItemProfitability(from, to, channel = 'all') {
  const { iana } = useTimezone();
  const enabled = Boolean(from && to);
  return useQuery({
    queryKey: ['reports', 'items', from, to, iana, channel],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      const { data } = await api.get(
        `/reports/items?from=${from}&to=${to}&limit=100&tz=${encodeURIComponent(iana)}${channelParam(channel)}`,
      );
      return data;
    },
  });
}

export function useStaffPerformance(from, to, channel = 'all') {
  const { iana } = useTimezone();
  const enabled = Boolean(from && to);
  return useQuery({
    queryKey: ['reports', 'staff', from, to, iana, channel],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      const { data } = await api.get(
        `/reports/staff?from=${from}&to=${to}&tz=${encodeURIComponent(iana)}${channelParam(channel)}`,
      );
      return data;
    },
  });
}

export function useItemsTrend(from, to, group = 'day', channel = 'all') {
  const { iana } = useTimezone();
  const enabled = Boolean(from && to);
  return useQuery({
    queryKey: ['reports', 'items-trend', from, to, group, iana, channel],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      const { data } = await api.get(
        `/reports/items-trend?from=${from}&to=${to}&group=${group}&tz=${encodeURIComponent(iana)}${channelParam(channel)}`,
      );
      return data;
    },
  });
}

export function useStaffTrend(from, to, group = 'day', channel = 'all') {
  const { iana } = useTimezone();
  const enabled = Boolean(from && to);
  return useQuery({
    queryKey: ['reports', 'staff-trend', from, to, group, iana, channel],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      const { data } = await api.get(
        `/reports/staff-trend?from=${from}&to=${to}&group=${group}&tz=${encodeURIComponent(iana)}${channelParam(channel)}`,
      );
      return data;
    },
  });
}

export function useSalesSummary(from, to, channel = 'all') {
  const { iana } = useTimezone();
  const enabled = Boolean(from && to);
  return useQuery({
    queryKey: ['reports', 'sales-summary', from, to, iana, channel],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      const { data } = await api.get(
        `/reports/sales-summary?from=${from}&to=${to}&tz=${encodeURIComponent(iana)}${channelParam(channel)}`,
      );
      return data;
    },
  });
}

export function useCollection(from, to, channel = 'all') {
  const { iana } = useTimezone();
  const enabled = Boolean(from && to);
  return useQuery({
    queryKey: ['reports', 'collection', from, to, iana, channel],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      const { data } = await api.get(
        `/reports/collection?from=${from}&to=${to}&tz=${encodeURIComponent(iana)}${channelParam(channel)}`,
      );
      return data;
    },
  });
}

export function useItemGroups(from, to, channel = 'all') {
  const { iana } = useTimezone();
  const enabled = Boolean(from && to);
  return useQuery({
    queryKey: ['reports', 'item-groups', from, to, iana, channel],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      const { data } = await api.get(
        `/reports/item-groups?from=${from}&to=${to}&tz=${encodeURIComponent(iana)}${channelParam(channel)}`,
      );
      return data;
    },
  });
}

export function useTableWiseSales(from, to) {
  const { iana } = useTimezone();
  const enabled = Boolean(from && to);
  return useQuery({
    queryKey: ['reports', 'table-wise', from, to, iana],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      const { data } = await api.get(
        `/reports/table-wise?from=${from}&to=${to}&tz=${encodeURIComponent(iana)}`,
      );
      return data;
    },
  });
}

export function useFoodCostVariance(closingCountId, openingCountId) {
  return useQuery({
    queryKey: ['reports', 'food-cost-variance', closingCountId, openingCountId || null],
    enabled: Boolean(closingCountId),
    staleTime: 60_000,
    queryFn: async () => {
      const params = new URLSearchParams({ closingCountId });
      if (openingCountId) params.set('openingCountId', openingCountId);
      const { data } = await api.get(`/reports/food-cost-variance?${params}`);
      return data;
    },
  });
}

export function useNCSales(from, to, channel = 'all') {
  const { iana } = useTimezone();
  const enabled = Boolean(from && to);
  return useQuery({
    queryKey: ['reports', 'nc-sales', from, to, iana, channel],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      const { data } = await api.get(
        `/reports/nc-sales?from=${from}&to=${to}&tz=${encodeURIComponent(iana)}${channelParam(channel)}`,
      );
      return data;
    },
  });
}
