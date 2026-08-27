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

// A sign-off changes the drift findings and the evidence pack at once, and a
// new expiry can raise a rule — so a write invalidates compliance and actions.
const invalidate = () => {
  queryClient.invalidateQueries({ queryKey: ['compliance'] });
  queryClient.invalidateQueries({ queryKey: ['actions'] });
};

export const useComplianceOverview = () =>
  useQuery({ queryKey: ['compliance', 'overview'], queryFn: get('/compliance/overview'), ...common });

export const useEvidencePack = () =>
  useQuery({ queryKey: ['compliance', 'evidence'], queryFn: get('/compliance/evidence-pack'), ...common });

export const useHygiene = () =>
  useQuery({ queryKey: ['compliance', 'hygiene'], queryFn: get('/compliance/hygiene'), ...common });

export const useShiftChecklists = () =>
  useQuery({ queryKey: ['compliance', 'shifts'], queryFn: get('/compliance/shifts'), ...common });

export const useSops = () =>
  useQuery({ queryKey: ['compliance', 'sops'], queryFn: get('/compliance/sops'), ...common });

export const useSopHistory = (slug) =>
  useQuery({
    queryKey: ['compliance', 'sop', slug],
    queryFn: get(`/compliance/sops/${slug}`),
    enabled: !!slug && !!localStorage.getItem('pos_user'),
  });

const post = (path) => ({
  mutationFn: async (body) => (await api.post(path, body)).data,
  onSuccess: invalidate,
});

export const useSubmitHygiene = () => useMutation(post('/compliance/hygiene'));
export const useSubmitShift   = () => useMutation(post('/compliance/shifts'));
export const useSaveLicence   = () => useMutation(post('/compliance/licence'));
export const useSaveCert      = () => useMutation(post('/compliance/certs'));
export const useRecordTest    = () => useMutation(post('/compliance/testing'));
export const useSaveSop       = () => useMutation(post('/compliance/sops'));

export const useAdoptSop = () =>
  useMutation({
    mutationFn: async (slug) => (await api.post(`/compliance/sops/${slug}/adopt`)).data,
    onSuccess: invalidate,
  });
