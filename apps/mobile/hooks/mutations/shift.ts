import { api } from '@/api/endpoints';
import { qkPrefix } from '@/lib/queryKeys';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateKeys } from './invalidate';

/** Money moves touch the shift, the drawer and every report built on them. */
const moneyKeys = [qkPrefix.shifts(), qkPrefix.cashDrawer(), qkPrefix.reports()] as const;

export function useOpenShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (openingCash: number) => api.openShift(openingCash),
    onSuccess: () => invalidateKeys(queryClient, moneyKeys),
  });
}

export function useCloseShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; closingCash: number }) =>
      api.closeShift(vars.id, vars.closingCash),
    onSuccess: () => invalidateKeys(queryClient, moneyKeys),
  });
}

export function useCashMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { shiftId: string; type: string; amount: number; note?: string }) =>
      api.cashMovement(vars),
    onSuccess: () => invalidateKeys(queryClient, moneyKeys),
  });
}
