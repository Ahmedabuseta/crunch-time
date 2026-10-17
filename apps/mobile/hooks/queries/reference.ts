import { api } from '@/api/endpoints';
import { STALE } from '@/lib/cachePolicy';
import { qk } from '@/lib/queryKeys';
import { useQuery } from '@tanstack/react-query';

/** Delivery reference data — needed only once checkout opens. */
export function useDeliveryZones(enabled = true) {
  return useQuery({
    queryKey: qk.deliveryZones,
    queryFn: () => api.deliveryZones(),
    enabled,
    staleTime: STALE.config,
  });
}

export function useDeliveryProfiles(enabled = true) {
  return useQuery({
    queryKey: qk.deliveryProfiles,
    queryFn: () => api.deliveryProfiles(),
    enabled,
    staleTime: STALE.config,
  });
}

export function useSubRecipes() {
  return useQuery({
    queryKey: qk.subRecipes,
    queryFn: () => api.subRecipes(),
    staleTime: STALE.config,
  });
}

export function useProductRecipes(productId: string | null | undefined) {
  return useQuery({
    queryKey: qk.productRecipes(productId ?? ''),
    queryFn: () => api.productRecipes(productId as string),
    enabled: Boolean(productId),
    staleTime: STALE.reference,
  });
}
