import { api } from '@/api/endpoints';
import type { Ingredient } from '@/api/types';
import { STALE } from '@/lib/cachePolicy';
import { qk } from '@/lib/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { usePagedQuery } from './paged';

/** Ingredients. Short freshness: the balance drops with every sale. */
export function useIngredients() {
  return useQuery({
    queryKey: qk.ingredients,
    queryFn: () => api.ingredients({ pageSize: 200 }),
    staleTime: STALE.short,
  });
}

/** The inventory screen's list: paged, searched, sorted and filtered by the
 * server, so "تحت الحد" counts the stock that is actually low rather than the
 * low stock on one page. */
export function usePagedIngredients() {
  return usePagedQuery<Ingredient>({
    keyFor: useCallback((query) => qk.paged('ingredients', query), []),
    load: useCallback(async (params) => {
      const res = await api.ingredients(params as any);
      return { items: res.ingredients, total: res.total, hasMore: res.hasMore };
    }, []),
    initialSort: 'name',
    staleTime: STALE.short,
  });
}

/** One ingredient for the edit form — a paged list cannot answer "give me id
 * X", because the row may be on a page the form never loaded. */
export function useIngredient(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.ingredient(id ?? ''),
    queryFn: () => api.ingredient(id as string),
    enabled: Boolean(id),
    staleTime: STALE.short,
  });
}

/** The low-stock banner: the count from the server's `total`, plus a few names
 * to show. Asking for three rows rather than the whole list is enough for both,
 * and stays right once the list itself is paged. */
export function useLowStock(limit = 3) {
  return useQuery({
    queryKey: [...qk.ingredients, 'low', limit],
    queryFn: () => api.ingredients({ low: '1', pageSize: limit }),
    staleTime: STALE.short,
  });
}

/** One ingredient's recent movements, shown under its form. */
export function useIngredientLedger(id: string | null | undefined, pageSize = 8) {
  return useQuery({
    queryKey: qk.ingredientLedger(id ?? ''),
    queryFn: () => api.ledger(id as string, { pageSize }),
    enabled: Boolean(id),
    staleTime: STALE.short,
  });
}
