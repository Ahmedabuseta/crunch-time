import { api, type CreateOrderPayload } from '@/api/endpoints';
import { qkPrefix } from '@/lib/queryKeys';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateKeys } from './invalidate';

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { payload: CreateOrderPayload; idempotencyKey: string }) =>
      api.createOrder(vars.payload, vars.idempotencyKey),
    // A sale moves the board and the stock ledger.
    onSuccess: () => invalidateKeys(queryClient, [qkPrefix.orders(), qkPrefix.inventory()]),
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: string; reason?: string }) =>
      api.updateOrderStatus(vars.id, vars.status, vars.reason),
    onSuccess: () => invalidateKeys(queryClient, [qkPrefix.orders()]),
  });
}

export function useAssignDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; profileId: string }) =>
      api.assignDriver(vars.id, vars.profileId),
    onSuccess: () => invalidateKeys(queryClient, [qkPrefix.orders()]),
  });
}

export function useRefundOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; reason: string; pin?: string }) =>
      api.refundOrder(vars.id, vars.reason, vars.pin),
    onSuccess: () => invalidateKeys(queryClient, [qkPrefix.orders()]),
  });
}

export function usePrintOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; kind: 'receipt' | 'kitchen' }) =>
      api.printOrder(vars.id, vars.kind),
    onSuccess: () => invalidateKeys(queryClient, [qkPrefix.orders()]),
  });
}
