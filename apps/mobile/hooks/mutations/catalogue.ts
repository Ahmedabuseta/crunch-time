import { api } from '@/api/endpoints';
import { qkPrefix } from '@/lib/queryKeys';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateKeys } from './invalidate';

/** Catalogue rows are referenced by the menu, so a write drops both. */
const catalogueKeys = [qkPrefix.categories(), qkPrefix.products(), qkPrefix.menu()] as const;

/** Both the create and the update route answer with a small result object. */
type WriteResult = { id?: string; ok?: boolean };

export function useSaveCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id?: string; body: Record<string, unknown> }): Promise<WriteResult> =>
      vars.id ? api.updateCategory(vars.id, vars.body) : api.createCategory(vars.body),
    onSuccess: () => invalidateKeys(queryClient, [qkPrefix.categories(), qkPrefix.menu()]),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; hard?: boolean }) =>
      api.deleteCategory(vars.id, vars.hard),
    onSuccess: () => invalidateKeys(queryClient, [qkPrefix.categories(), qkPrefix.menu()]),
  });
}

export function useSaveProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id?: string; body: Record<string, unknown> }): Promise<WriteResult> =>
      vars.id ? api.updateProduct(vars.id, vars.body) : api.createProduct(vars.body),
    onSuccess: () => invalidateKeys(queryClient, catalogueKeys),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; hard?: boolean }) => api.deleteProduct(vars.id, vars.hard),
    onSuccess: () => invalidateKeys(queryClient, catalogueKeys),
  });
}

export function useSaveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id?: string; body: Record<string, unknown> }): Promise<WriteResult> =>
      vars.id ? api.updateUser(vars.id, vars.body) : api.createUser(vars.body),
    onSuccess: () => invalidateKeys(queryClient, [qkPrefix.users()]),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; hard?: boolean }) => api.deleteUser(vars.id, vars.hard),
    onSuccess: () => invalidateKeys(queryClient, [qkPrefix.users()]),
  });
}
