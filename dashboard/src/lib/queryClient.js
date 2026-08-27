import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,      // 2 minutes — serve cache, refetch in background
      gcTime: 1000 * 60 * 60,         // 1 hour — keep in memory for offline fallback
      retry: (failureCount, error) => {
        // Never retry client errors (4xx) — only transient network failures
        if (error?.response?.status >= 400 && error?.response?.status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000), // 1s → 2s → 4s … cap 30s
      refetchOnWindowFocus: false,
    },
  },
});

// Returns an onSuccess handler that invalidates one or more query keys.
// Each arg is a queryKey root (string) or a full queryKey array:
//   onSuccess: invalidate('coupons')
//   onSuccess: invalidate('reservations', 'tables')
//   onSuccess: invalidate(['order', orderId])
export const invalidate = (...keys) => () =>
  keys.forEach((k) =>
    queryClient.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] }));