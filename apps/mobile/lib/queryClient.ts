// The app's single QueryClient and its on-disk persistence. The persister keeps
// the cache in AsyncStorage, so a cold start — with or without a connection —
// paints the last known menu, board and reports instead of skeletons.
import { CACHE_MAX_AGE, cacheBuster, shouldDehydrateQuery, shrinkToNewest } from '@/lib/cachePolicy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';
import Constants from 'expo-constants';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cached data is served first and a fetch runs behind it; when the phone
      // is offline that fetch simply is not attempted.
      networkMode: 'offlineFirst',
      staleTime: 5 * 60 * 1000,
      // Must be >= `maxAge`, or a query is garbage-collected before its
      // persisted copy would have expired — leaving an entry that can never be
      // read back.
      gcTime: CACHE_MAX_AGE,
      refetchOnReconnect: true,
      // A 4xx is the server answering; retrying it just repeats the refusal.
      retry: (count, error) => {
        const status = (error as { status?: number } | null)?.status ?? 0;
        return (status === 0 || status >= 500) && count < 2;
      },
    },
    mutations: {
      // Offline writes are not queued in this change, so do not pretend:
      // a mutation waits until there is a connection, then runs once.
      networkMode: 'online',
      retry: 1,
    },
  },
});

/**
 * Writes the cache to AsyncStorage.
 *
 * `throttleTime` is measured from the first write in a burst, and on a busy
 * shop every sale invalidates several queries at once. A longer window means
 * one serialisation of the whole cache per burst instead of one per query, and
 * the data is re-readable from memory regardless — this only decides how soon
 * a *cold start* sees it.
 *
 * `retry` is what makes the cache reliable rather than merely present: Android
 * caps a single AsyncStorage entry at about 2 MB, and a day of paged order lists
 * can pass that. The failure is silent — the write throws, nothing is stored,
 * and the next cold start has no cache at all. Keeping the newest queries and
 * dropping the old ones always fits, because a cache missing its oldest page
 * still paints the board.
 */
export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'ct.queryCache',
  throttleTime: 2000,
  retry: ({ persistedClient, errorCount }) => {
    const kept = shrinkToNewest(persistedClient.clientState.queries, errorCount);
    if (!kept) return undefined;
    return {
      ...persistedClient,
      clientState: { ...persistedClient.clientState, queries: kept },
    };
  },
});

export const persistOptions: PersistQueryClientProviderProps['persistOptions'] = {
  persister,
  maxAge: CACHE_MAX_AGE,
  buster: cacheBuster(Constants.expoConfig?.version),
  dehydrateOptions: {
    shouldDehydrateQuery,
  },
};

/**
 * Drop every cached read, in memory and on disk. Called when the session ends
 * (sign-out, a 401, or the owner pointing the phone at another server) — the
 * persisted cache is unencrypted business data and must not outlive the login.
 */
export async function resetQueryCache(): Promise<void> {
  queryClient.clear();
  try {
    await persister.removeClient();
  } catch {
    // nothing on disk yet, or no storage (web) — nothing to remove
  }
}
