import { api } from '@/api/endpoints';
import { qkPrefix } from '@/lib/queryKeys';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateKeys } from './invalidate';

/** Catalogue rows are referenced by the menu, so a write drops both. */
const catalogueKeys = [qkPrefix.categories(), qkPrefix.products(), qkPrefix.menu()] as const;
const addonKeys = [qkPrefix.addons(), qkPrefix.menu(), qkPrefix.products()] as const;
const modifierKeys = [qkPrefix.modifierGroups(), qkPrefix.menu(), qkPrefix.products()] as const;

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

export function useDuplicateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.duplicateProduct(id),
    onSuccess: () => invalidateKeys(queryClient, catalogueKeys),
  });
}

export function useSaveAddon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id?: string; body: Record<string, unknown> }): Promise<WriteResult> =>
      vars.id ? api.updateAddon(vars.id, vars.body) : api.createAddon(vars.body),
    onSuccess: () => invalidateKeys(queryClient, addonKeys),
  });
}

export function useDeleteAddon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; hard?: boolean }) => api.deleteAddon(vars.id, vars.hard),
    onSuccess: () => invalidateKeys(queryClient, addonKeys),
  });
}

export function useSetAddonProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; productIds: string[] }) =>
      api.setAddonProducts(vars.id, vars.productIds),
    onSuccess: () => invalidateKeys(queryClient, addonKeys),
  });
}

export function useSaveModifierGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id?: string; body: Record<string, unknown> }): Promise<WriteResult> =>
      vars.id ? api.updateModifierGroup(vars.id, vars.body) : api.createModifierGroup(vars.body),
    onSuccess: () => invalidateKeys(queryClient, modifierKeys),
  });
}

export function useDeleteModifierGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; hard?: boolean }) =>
      api.deleteModifierGroup(vars.id, vars.hard),
    onSuccess: () => invalidateKeys(queryClient, modifierKeys),
  });
}

export function useReorderModifierGroups() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.reorderModifierGroups(ids),
    onSuccess: () => invalidateKeys(queryClient, modifierKeys),
  });
}

export function useSetModifierGroupProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; productIds: string[] }) =>
      api.setModifierGroupProducts(vars.id, vars.productIds),
    onSuccess: () => invalidateKeys(queryClient, modifierKeys),
  });
}

export function useSaveModifier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id?: string; body: Record<string, unknown> }): Promise<WriteResult> =>
      vars.id ? api.updateModifier(vars.id, vars.body) : api.createModifier(vars.body),
    onSuccess: () => invalidateKeys(queryClient, modifierKeys),
  });
}

export function useDeleteModifier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; hard?: boolean }) => api.deleteModifier(vars.id, vars.hard),
    onSuccess: () => invalidateKeys(queryClient, modifierKeys),
  });
}

export function useReorderModifiers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.reorderModifiers(ids),
    onSuccess: () => invalidateKeys(queryClient, modifierKeys),
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
