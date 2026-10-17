import { api } from '@/api/endpoints';
import { qk, qkPrefix } from '@/lib/queryKeys';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateKeys } from './invalidate';

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.saveSettings(body),
    onSuccess: () => invalidateKeys(queryClient, [qkPrefix.settings(), qkPrefix.menu()]),
  });
}

export function useTriggerBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.triggerBackup(),
    onSuccess: () => invalidateKeys(queryClient, [qk.backupStatus]),
  });
}
