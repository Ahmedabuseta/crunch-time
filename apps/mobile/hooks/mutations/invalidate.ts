import type { QueryClient } from '@tanstack/react-query';

/**
 * Drop the given key prefixes. Every mutation funnels through here so the set
 * of keys a write invalidates is written down once, next to that write.
 */
export function invalidateKeys(
  queryClient: QueryClient,
  keys: readonly (readonly unknown[])[]
): void {
  for (const queryKey of keys) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
