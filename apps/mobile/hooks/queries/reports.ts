import { api } from '@/api/endpoints';
import { STALE } from '@/lib/cachePolicy';
import { qk } from '@/lib/queryKeys';
import { useQuery } from '@tanstack/react-query';

interface RangeQuery {
  from?: string;
  to?: string;
}

/** The current shift's Z report (or a named one). */
export function useZReport(shiftId?: string) {
  return useQuery({
    queryKey: qk.zReport(shiftId),
    queryFn: () => api.zReport(shiftId),
    staleTime: STALE.report,
  });
}

/** Any of the server's named reports, flattened by the viewer. */
export function useReport<T = unknown>(name: string, query?: RangeQuery) {
  return useQuery({
    queryKey: qk.reports(name, query),
    // `RangeQuery` is a plain string map; the helper wants an index signature.
    queryFn: () =>
      api.report<T>(name, query as Record<string, string | number | undefined> | undefined),
    enabled: Boolean(name),
    staleTime: STALE.report,
  });
}

/** Every shift in a range, with its cash position. */
export function useShiftSummary(query?: RangeQuery) {
  return useQuery({
    queryKey: qk.shiftSummary(query),
    queryFn: () => api.shiftSummary(query),
    staleTime: STALE.report,
  });
}

/** One shift in full. */
export function useShiftReport(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.shiftReport(id ?? ''),
    queryFn: () => api.shiftReport(id as string),
    enabled: Boolean(id),
    staleTime: STALE.report,
  });
}

/** One day's totals — the orders board's stat strip. */
export interface DailySummary {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  cancelledOrders: number;
  refundedOrders: number;
  totalRefunded: number;
  costOfGoods: number;
  grossProfit: number;
}

export function useDailySummary(date?: string) {
  return useQuery({
    queryKey: qk.reports('daily', { date: date ?? null }),
    queryFn: () => api.report<DailySummary>('daily', date ? { date } : undefined),
    staleTime: STALE.report,
  });
}
