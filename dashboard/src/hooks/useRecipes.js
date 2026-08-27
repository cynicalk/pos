import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { invalidate } from '../lib/queryClient';

export function useRecipes() {
  return useQuery({
    queryKey: ['recipes'],
    queryFn: async () => {
      const { data } = await api.get('/recipes');
      return data;
    },
  });
}

export function useCreateRecipe() {
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/recipes', body);
      return data;
    },
    onSuccess: invalidate('recipes'),
  });
}

export function useUpdateRecipe() {
  return useMutation({
    mutationFn: async ({ id, ...body }) => {
      const { data } = await api.patch(`/recipes/${id}`, body);
      return data;
    },
    onSuccess: invalidate('recipes'),
  });
}

export function useDeleteRecipe() {
  return useMutation({
    mutationFn: async (id) => {
      const { data } = await api.delete(`/recipes/${id}`);
      return data;
    },
    onSuccess: invalidate('recipes'),
  });
}

export function useCostReport() {
  return useQuery({
    queryKey: ['recipes', 'cost-report'],
    queryFn: async () => {
      const { data } = await api.get('/recipes/cost-report');
      return data;
    },
  });
}

export function useTakeSnapshot() {
  return useMutation({
    mutationFn: async ({ id, triggeredBy = 'MANUAL' }) => {
      const { data } = await api.post(`/recipes/${id}/snapshot`, { triggeredBy });
      return data;
    },
  });
}
