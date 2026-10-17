import { api } from '@/api/endpoints';
import { qkPrefix } from '@/lib/queryKeys';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateKeys } from './invalidate';

/** A recipe line is keyed under its product, so the whole products prefix drops. */
export function useUpsertRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      id?: string;
      productId: string;
      ingredientId?: string | null;
      subRecipeId?: string | null;
      quantityPerUnit: number;
    }) => api.upsertRecipe(body),
    onSuccess: () => invalidateKeys(queryClient, [qkPrefix.products()]),
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteRecipe(id),
    onSuccess: () => invalidateKeys(queryClient, [qkPrefix.products()]),
  });
}
