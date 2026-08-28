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

// The two calls that put a local model in the request path. The shared client
// times out at 8s, which is right for ordinary reads and far too short here: a
// 7B drafting three sentences routinely takes longer, and the timeout surfaced
// as "Could not draft a reply" while the server was still working and about to
// save a perfectly good draft. Both are explicit, button-pressed actions with a
// spinner, so waiting is expected — and the server caps its own model call
// below this and falls back to the template, so the ceiling is never reached.
const MODEL_TIMEOUT_MS = 30_000;

// A new rank reading can raise a rank_drop finding on the next evaluation pass,
// so recording one invalidates actions too — same reasoning as useCompliance.
const invalidate = (...keys) => {
  keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
};

// Same reasoning as useActions: /reputation/insights is admin-only and Overview
// renders for every role, so the caller must be able to switch it off.
export const useReviewInsights = (days, { enabled = true } = {}) =>
  useQuery({
    queryKey: ['reputation', 'insights', days ?? null],
    queryFn: get(`/reputation/insights${days ? `?days=${days}` : ''}`),
    ...common,
    enabled: enabled && common.enabled,
  });

export const useReviewQueue = (days) =>
  useQuery({
    queryKey: ['reputation', 'reviews', days ?? null],
    queryFn: get(`/reputation/reviews${days ? `?days=${days}` : ''}`),
    ...common,
  });

export const useRankings = () =>
  useQuery({ queryKey: ['reputation', 'rankings'], queryFn: get('/reputation/rankings'), ...common });

export const useGuestMetrics = (days) =>
  useQuery({
    queryKey: ['reputation', 'guests', days ?? null],
    queryFn: get(`/reputation/guests${days ? `?days=${days}` : ''}`),
    ...common,
  });

export const useChurnRisk = () =>
  useQuery({
    queryKey: ['reputation', 'guests', 'churn'],
    queryFn: get('/reputation/guests/churn'),
    ...common,
  });

export const useDraftReply = () =>
  useMutation({
    mutationFn: async (reviewId) => {
      const { data } = await api.post(`/reputation/reviews/${reviewId}/draft`, null,
        { timeout: MODEL_TIMEOUT_MS });
      return data;
    },
    onSuccess: () => invalidate(['reputation', 'reviews']),
  });

export const useSaveReply = () =>
  useMutation({
    mutationFn: async ({ reviewId, draft }) => {
      const { data } = await api.put(`/reputation/reviews/${reviewId}/draft`, { draft });
      return data;
    },
    onSuccess: () => invalidate(['reputation', 'reviews']),
  });

export const useMarkReplySent = () =>
  useMutation({
    mutationFn: async (reviewId) => {
      const { data } = await api.post(`/reputation/reviews/${reviewId}/sent`);
      return data;
    },
    onSuccess: () => invalidate(['reputation', 'reviews']),
  });

export const useClassifyReviews = () =>
  useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/reputation/classify', null,
        { timeout: MODEL_TIMEOUT_MS });
      return data;
    },
    onSuccess: () => invalidate(['reputation']),
  });

export const useRecordRank = () =>
  useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post('/reputation/rankings/ranks', payload);
      return data;
    },
    onSuccess: () => invalidate(['reputation', 'rankings'], ['actions']),
  });

export const useDeleteRank = () =>
  useMutation({
    mutationFn: async (id) => {
      const { data } = await api.delete(`/reputation/rankings/ranks/${id}`);
      return data;
    },
    onSuccess: () => invalidate(['reputation', 'rankings'], ['actions']),
  });

export const useRecordCompetitor = () =>
  useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post('/reputation/rankings/competitors', payload);
      return data;
    },
    onSuccess: () => invalidate(['reputation', 'rankings']),
  });

export const useDeleteCompetitor = () =>
  useMutation({
    mutationFn: async (id) => {
      const { data } = await api.delete(`/reputation/rankings/competitors/${id}`);
      return data;
    },
    onSuccess: () => invalidate(['reputation', 'rankings']),
  });
