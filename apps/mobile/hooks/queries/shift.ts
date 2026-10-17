import { api } from '@/api/endpoints';
import { STALE } from '@/lib/cachePolicy';
import { qk } from '@/lib/queryKeys';
import { useQuery } from '@tanstack/react-query';

/** The open shift, or null when the till is closed. */
export function useCurrentShift() {
  return useQuery({
    queryKey: qk.currentShift,
    queryFn: () => api.currentShift(),
    staleTime: STALE.short,
  });
}

/** Drawer movements + expected cash for one shift. */
export function useCashDrawer(shiftId: string | null | undefined) {
  return useQuery({
    queryKey: qk.cashDrawer(shiftId ?? ''),
    queryFn: () => api.cashDrawer(shiftId as string),
    enabled: Boolean(shiftId),
    staleTime: STALE.short,
  });
}
