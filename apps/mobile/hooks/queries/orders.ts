import { api } from '@/api/endpoints';
import type { Order } from '@/api/types';
import { STALE } from '@/lib/cachePolicy';
import { qk } from '@/lib/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { usePagedQuery } from './paged';

interface OrderFilters {
  status?: string;
  orderType?: string;
  search?: string;
}

/**
 * The order board's list. `staleTime: 0` means every visit and every socket
 * frame refetches; the persisted copy is only what an offline start paints.
 */
export function useOrders(filters?: OrderFilters) {
  return useQuery({
    queryKey: qk.orders(filters),
    queryFn: () => api.orders(filters),
    staleTime: STALE.live,
  });
}

/**
 * The board itself: paged, sorted and filtered by the server, so the status,
 * type and driver tabs narrow the orders rather than one page of them. The
 * screen drives it with `setFilter` / `sortBy` / `onSearch`.
 */
export function usePagedOrders() {
  return usePagedQuery<Order>({
    keyFor: useCallback((query) => qk.orders(query), []),
    load: useCallback(async (params) => {
      const res = await api.orders(params as any);
      return { items: res.orders, total: res.total, hasMore: res.hasMore };
    }, []),
    initialSort: 'createdAt',
    initialDir: 'desc',
    staleTime: STALE.live,
  });
}

export function useOrder(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.order(id ?? ''),
    queryFn: () => api.order(id as string),
    enabled: Boolean(id),
    staleTime: STALE.live,
  });
}
