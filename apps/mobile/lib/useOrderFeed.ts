import { getApiBaseUrl, getToken } from '@/api/client';
import { api } from '@/api/endpoints';
import type { Order } from '@/api/types';
import { toWebSocketUrl } from '@/lib/http';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The order board's data source: an initial fetch plus live updates over the
 * server's /ws socket, so a sale taken on either phone or till shows up at once.
 * Reconnects with a small backoff while the app is open.
 */
export function useOrderFeed(status?: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);

  const statusRef = useRef(status);
  statusRef.current = status;

  const reload = useCallback(async () => {
    try {
      const res = await api.orders(statusRef.current ? { status: statusRef.current } : undefined);
      setOrders(res.orders);
      setError('');
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, status]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let attempts = 0;

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
          if (message?.channel === 'order:created' || message?.channel === 'order:updated') {
            void reload();
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
      if (retry) clearTimeout(retry);
      try {
        socket?.close();
      } catch {
        // already closing
      }
    };
  }, [reload]);

  return { orders, loading, error, live, reload };
}
