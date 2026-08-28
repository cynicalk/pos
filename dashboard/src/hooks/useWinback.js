import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { queryClient } from '../lib/queryClient';

const common = {
  enabled: !!localStorage.getItem('pos_user'),
  staleTime: 5 * 60_000,
};

export const useWinbackOffers = () =>
  useQuery({
    queryKey: ['winback', 'offers'],
    queryFn: async () => (await api.get('/winback/offers')).data,
    ...common,
  });

export const useCreateWinbackOffer = () =>
  useMutation({
    mutationFn: async (customerId) => (await api.post('/winback/offers', { customerId })).data,
    onSuccess: () => {
      // A new offer changes both the offer list and the open-offer state the
      // churn table reads to decide whether the guest already has one.
      queryClient.invalidateQueries({ queryKey: ['winback'] });
      queryClient.invalidateQueries({ queryKey: ['reputation', 'guests', 'churn'] });
    },
  });
