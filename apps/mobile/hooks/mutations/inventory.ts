import { api } from '@/api/endpoints';
import { qkPrefix } from '@/lib/queryKeys';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateKeys } from './invalidate';

const stockKeys = [qkPrefix.ingredients(), qkPrefix.inventory()] as const;

/** Both the create and the update route answer with a small result object. */
type WriteResult = { id?: string; ok?: boolean };

export function useSaveIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id?: string; body: Record<string, unknown> }): Promise<WriteResult> =>
      vars.id ? api.updateIngredient(vars.id, vars.body) : api.createIngredient(vars.body),
    onSuccess: () => invalidateKeys(queryClient, stockKeys),
  });
}

export function useDeleteIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; hard?: boolean }) =>
      api.deleteIngredient(vars.id, vars.hard),
    onSuccess: () => invalidateKeys(queryClient, stockKeys),
  });
}

export function useRestock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      body: { qty: number; note?: string; unitCost?: number; packagePrice?: number; supplier?: string };
    }) => api.restock(vars.id, vars.body),
    onSuccess: () => invalidateKeys(queryClient, stockKeys),
  });
}

export function useRecordWaste() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: { qty: number; note?: string } }) =>
      api.recordWaste(vars.id, vars.body),
    onSuccess: () => invalidateKeys(queryClient, stockKeys),
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: { delta: number; note?: string } }) =>
      api.adjustStock(vars.id, vars.body),
    onSuccess: () => invalidateKeys(queryClient, stockKeys),
  });
}
