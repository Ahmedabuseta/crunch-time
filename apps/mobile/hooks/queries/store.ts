import { api } from '@/api/endpoints';
import { STALE } from '@/lib/cachePolicy';
import { qk } from '@/lib/queryKeys';
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
