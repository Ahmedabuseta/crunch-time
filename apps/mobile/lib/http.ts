// Plain-TS HTTP core for the remote POS API. Deliberately free of React Native
// imports so it can be unit-tested by the repo's existing vitest runner; the
// RN-specific wiring (SecureStore, device label) lives in api/client.ts.

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** `192.168.1.5:4317` → `http://192.168.1.5:4317`; strips a trailing slash. */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

export interface HttpConfig {
  baseUrl: string;
  token: string | null;
}

export interface HttpClientOptions {
  getConfig: () => HttpConfig;
  /** Injected in tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Persist a refreshed token pushed back by the server (X-Refresh-Token). */
  onTokenRefresh?: (token: string) => void;
  /** Called on a 401 so the app can bounce back to the setup screen. */
  onUnauthorized?: () => void;
  /** Sent as X-Device-Label so audit rows name the phone. */
  deviceLabel?: () => string | undefined;
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON body. */
  body?: unknown;
  /** Sent as Idempotency-Key so a retried sale is not rung up twice. */
  idempotencyKey?: string;
  /** Skip the Authorization header (login). */
  auth?: boolean;
}

export interface HttpClient {
  request: <T>(path: string, options?: RequestOptions) => Promise<T>;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const timeoutMs = options.timeoutMs ?? 15000;

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const { baseUrl, token } = options.getConfig();
    if (!baseUrl) throw new ApiError('الخادم غير مضبوط', 0);

    const doFetch = options.fetchImpl ?? fetch;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`;
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    const label = options.deviceLabel?.();
    if (label) headers['X-Device-Label'] = label;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller ? controller.signal : undefined,
      } as RequestInit);
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new ApiError('الخادم مبيردّش — اتأكد إن الجهاز شغال', 0);
      throw new ApiError('تعذّر الاتصال بالخادم — راجع العنوان والشبكة', 0);
    } finally {
      if (timer) clearTimeout(timer);
    }

    // The server slides the session forward with a fresh token on long-lived
    // sessions; keep it so the phone never has to log in again mid-use.
    const refreshed = res.headers?.get?.('x-refresh-token');
    if (refreshed) options.onTokenRefresh?.(refreshed);

    let payload: any = null;
    const text = await res.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (res.status === 401 && opts.auth !== false) {
      options.onUnauthorized?.();
      throw new ApiError(payload?.error || 'الجلسة انتهت — سجّل الدخول تاني', 401);
    }
    if (!res.ok) {
      throw new ApiError(payload?.error || `خطأ من الخادم (${res.status})`, res.status);
    }
    return payload as T;
  }

  return { request };
}
