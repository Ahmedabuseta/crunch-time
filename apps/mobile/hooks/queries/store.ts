import { api } from '@/api/endpoints';
import { STALE } from '@/lib/cachePolicy';
import { qk } from '@/lib/queryKeys';
import type { DiscountLine } from '@/lib/discount';
import { useQuery } from '@tanstack/react-query';

/** Store settings — the phone only needs `taxRate` and the receipt fields. */
export function useSettings() {
  return useQuery({
    queryKey: qk.settings,
    queryFn: () => api.settings(),
    staleTime: STALE.reference,
  });
}

/**
 * `/health` answers "is the server up right now", so it is never persisted and
 * is only as fresh as the last ping.
 */
export function useHealth(options?: { refetchInterval?: number; enabled?: boolean }) {
  return useQuery({
    queryKey: qk.health,
    queryFn: () => api.health(),
    staleTime: 0,
    retry: false,
    meta: { persist: false },
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled ?? true,
  });
}

export function usePrinters() {
  return useQuery({
    queryKey: qk.printers,
    queryFn: () => api.printers(),
    staleTime: STALE.config,
  });
}

export function useBackupStatus() {
  return useQuery({
    queryKey: qk.backupStatus,
    queryFn: () => api.backupStatus(),
    staleTime: 0,
    meta: { persist: false },
  });
}

/**
 * Best auto-applied promo for the current basket. Keyed by a line signature so
 * an unchanged cart reuses the answer, and disabled while a manual code is in
 * play — the manual code always wins.
 */
export function useAutoDiscount(lines: DiscountLine[], subtotal: number, enabled = true) {
  const signature = lines
    .map((line) => `${line.lineId}:${line.productId}:${line.categoryId}:${line.unitTotal}:${line.quantity}`)
    .join('|');

  return useQuery({
    queryKey: ['discount-auto', signature, subtotal],
    queryFn: () => api.resolveAutoDiscount({ lines, subtotal }),
    enabled: enabled && lines.length > 0,
    staleTime: 15_000,
  });
}
