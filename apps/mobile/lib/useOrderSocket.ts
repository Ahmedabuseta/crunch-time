import { getApiBaseUrl, getToken } from '@/api/client';
import { toWebSocketUrl } from '@/lib/http';
import { qkPrefix } from '@/lib/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/**
 * The live half of the board: the server's `/ws` socket, which turns every
 * mutation on any device into a cache invalidation here. React Query then does
 * the refetching, so this hook owns no data of its own.
 *
 * Reconnects with a small backoff while the screen is open. `live` is whether
 * the socket is currently up — the board shows it next to the online badge.
 */
export function useOrderSocket(enabled = true) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let reportTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let attempts = 0;

    const invalidateDashboard = () => {
      if (reportTimer) return;
      reportTimer = setTimeout(() => {
        reportTimer = null;
        void queryClient.invalidateQueries({ queryKey: qkPrefix.reports() });
        void queryClient.invalidateQueries({ queryKey: qkPrefix.ingredients() });
      }, 1200);
    };

    const connect = () => {
      const baseUrl = getApiBaseUrl();
      const token = getToken();
      if (!baseUrl || !token) return;
      try {
        socket = new WebSocket(toWebSocketUrl(baseUrl, '/ws', { token }));
      } catch {
        return;
      }
      socket.onopen = () => {
        attempts = 0;
        setLive(true);
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data));
          switch (message?.channel) {
            case 'order:created':
            case 'order:updated':
              // The bare prefix, not `qk.orders()`: that builds ['orders', {}],
              // which does not prefix-match the paged board's ['orders','paged',
              // …] key — so a live sale would never refresh a paged list.
              void queryClient.invalidateQueries({ queryKey: qkPrefix.orders() });
              invalidateDashboard();
              break;
            case 'shift:updated':
              void queryClient.invalidateQueries({ queryKey: ['shifts'] });
              break;
            case 'cash:updated':
              void queryClient.invalidateQueries({ queryKey: ['cash-drawer'] });
              invalidateDashboard();
              break;
            default:
              break;
          }
        } catch {
          // ignore malformed frames
        }
      };
      socket.onclose = () => {
        setLive(false);
        if (closed) return;
        attempts += 1;
        retry = setTimeout(connect, Math.min(1000 * attempts, 10000));
      };
      socket.onerror = () => {
        try {
          socket?.close();
        } catch {
          // already closing
        }
      };
    };

    connect();
    return () => {
      closed = true;
      setLive(false);
      if (retry) clearTimeout(retry);
      if (reportTimer) clearTimeout(reportTimer);
      try {
        socket?.close();
      } catch {
        // already closing
      }
    };
  }, [queryClient, enabled]);

  return { live: enabled && live };
}
