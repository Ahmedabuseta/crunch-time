import { api, ALL_ROWS } from '@/api/endpoints';
import type { AppUser, Category, Product } from '@/api/types';
import { STALE } from '@/lib/cachePolicy';
import { qk } from '@/lib/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { usePagedQuery } from './paged';

/** The sellable menu: categories + products. */
export function useMenu() {
  return useQuery({
    queryKey: qk.menu,
    queryFn: () => api.menu(),
    staleTime: STALE.reference,
  });
}

/** Addons/modifiers for one product, fetched when the owner opens it. */
export function useProductOptions(productId: string | null | undefined) {
  return useQuery({
    queryKey: qk.productOptions(productId ?? ''),
    queryFn: () => api.productOptions(productId as string),
    enabled: Boolean(productId),
    staleTime: STALE.reference,
  });
}

/** Every category, for the chips and pickers on other screens — not a page of
 * them. The categories screen itself uses `usePagedCategories`. */
export function useCategories() {
  return useQuery({
    queryKey: qk.categories,
    queryFn: () => api.categories({ pageSize: ALL_ROWS }),
    staleTime: STALE.reference,
  });
}

export function useProducts(categoryId?: string) {
  return useQuery({
    queryKey: qk.products(categoryId),
    queryFn: () => api.products(categoryId ? { categoryId } : undefined),
    staleTime: STALE.reference,
  });
}

export function useAddons() {
  return useQuery({
    queryKey: qk.addons,
    queryFn: () => api.addons(),
    staleTime: STALE.reference,
  });
}

/** One record for an edit form. Paged lists cannot answer "give me id X" —
 * the row may be on a page the form never loaded. */
export function useProduct(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.product(id ?? ''),
    queryFn: () => api.product(id as string),
    enabled: Boolean(id),
    staleTime: STALE.reference,
  });
}

export function useCategory(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.category(id ?? ''),
    queryFn: () => api.category(id as string),
    enabled: Boolean(id),
    staleTime: STALE.reference,
  });
}

export function useUser(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.user(id ?? ''),
    queryFn: () => api.user(id as string),
    enabled: Boolean(id),
    staleTime: STALE.reference,
  });
}

/** The catalogue lists, paged, searched and sorted by the server. */
export function usePagedProducts() {
  return usePagedQuery<Product>({
    keyFor: useCallback((query) => qk.paged('products', query), []),
    load: useCallback(async (params) => {
      const res = await api.products(params as any);
      return { items: res.products, total: res.total, hasMore: res.hasMore };
    }, []),
    initialSort: 'name',
    staleTime: STALE.reference,
  });
}

export function usePagedCategories() {
  return usePagedQuery<Category>({
    keyFor: useCallback((query) => qk.paged('categories', query), []),
    load: useCallback(async (params) => {
      const res = await api.categories(params as any);
      return { items: res.categories, total: res.total, hasMore: res.hasMore };
    }, []),
    initialSort: 'sortOrder',
    staleTime: STALE.reference,
  });
}

export function usePagedUsers() {
  return usePagedQuery<AppUser>({
    keyFor: useCallback((query) => qk.paged('users', query), []),
    load: useCallback(async (params) => {
      const res = await api.users(params as any);
      return { items: res.users, total: res.total, hasMore: res.hasMore };
    }, []),
    initialSort: 'name',
    staleTime: STALE.reference,
  });
}
