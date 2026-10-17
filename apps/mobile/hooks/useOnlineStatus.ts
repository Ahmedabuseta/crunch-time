import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/**
 * Whether React Query currently considers the phone online. Backed by the same
 * `onlineManager` the queries use, so the badge and the fetching behaviour can
 * never disagree.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    // Web/SSR snapshot: assume online.
    () => true
  );
}
