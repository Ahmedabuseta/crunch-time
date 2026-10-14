import { describe, expect, it, vi } from 'vitest';
import { ApiError, createHttpClient, normalizeBaseUrl } from './http';

describe('normalizeBaseUrl', () => {
  it('adds a scheme when the owner types a bare host:port', () => {
    expect(normalizeBaseUrl('192.168.1.5:4317')).toBe('http://192.168.1.5:4317');
    expect(normalizeBaseUrl('100.101.102.103:4317')).toBe('http://100.101.102.103:4317');
  });

  it('keeps an explicit scheme and drops trailing slashes', () => {
    expect(normalizeBaseUrl('https://pos.tail-scale.ts.net:4317/')).toBe('https://pos.tail-scale.ts.net:4317');
    expect(normalizeBaseUrl('  http://10.0.0.2:4317//  ')).toBe('http://10.0.0.2:4317');
  });

  it('returns empty for empty input', () => {
    expect(normalizeBaseUrl('   ')).toBe('');
    expect(normalizeBaseUrl('')).toBe('');
  });
});

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

function client(overrides: Partial<Parameters<typeof createHttpClient>[0]> = {}) {
  const fetchImpl = vi.fn();
  const onTokenRefresh = vi.fn();
  const onUnauthorized = vi.fn();
  const http = createHttpClient({
    getConfig: () => ({ baseUrl: 'http://10.0.0.2:4317', token: 'tok-1' }),
    fetchImpl: fetchImpl as unknown as typeof fetch,
    onTokenRefresh,
    onUnauthorized,
    deviceLabel: () => 'iPhone 15',
    ...overrides,
  });
  return { http, fetchImpl, onTokenRefresh, onUnauthorized };
}

describe('createHttpClient', () => {
  it('sends the bearer token and device label on an authed GET', async () => {
    const { http, fetchImpl } = client();
    fetchImpl.mockResolvedValueOnce(jsonResponse({ orders: [] }));

    const result = await http.request('/orders');

    expect(result).toEqual({ orders: [] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://10.0.0.2:4317/orders');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok-1');
    expect(init.headers['X-Device-Label']).toBe('iPhone 15');
  });

  it('omits auth on login and sends a JSON body', async () => {
    const { http, fetchImpl } = client();
    fetchImpl.mockResolvedValueOnce(jsonResponse({ ok: true, token: 't', expiresIn: 1 }));

    await http.request('/auth/login', { method: 'POST', body: { pin: '1234' }, auth: false });

    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ pin: '1234' });
  });

  it('forwards the idempotency key so a retry is not a second sale', async () => {
    const { http, fetchImpl } = client();
    fetchImpl.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'o-1' }));

    await http.request('/orders', { method: 'POST', body: {}, idempotencyKey: 'abc-123' });

    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers['Idempotency-Key']).toBe('abc-123');
  });

  it('persists a slid session token pushed back by the server', async () => {
    const { http, fetchImpl, onTokenRefresh } = client();
    fetchImpl.mockResolvedValueOnce(jsonResponse({ ok: true }, { headers: { 'x-refresh-token': 'fresh' } }));

    await http.request('/orders');

    expect(onTokenRefresh).toHaveBeenCalledWith('fresh');
  });

  it('reports a 401 to the session and surfaces the server message', async () => {
    const { http, fetchImpl, onUnauthorized } = client();
    fetchImpl.mockResolvedValueOnce(jsonResponse({ ok: false, error: 'الجلسة انتهت' }, { status: 401 }));

    await expect(http.request('/orders')).rejects.toThrowError(ApiError);
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('turns a refused mutation into an ApiError carrying the Arabic message', async () => {
    const { http, fetchImpl } = client();
    fetchImpl.mockResolvedValueOnce(jsonResponse({ ok: false, error: 'لا يمكن إنشاء طلب بدون وردية مفتوحة' }, { status: 400 }));

    await expect(http.request('/orders', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 400,
      message: 'لا يمكن إنشاء طلب بدون وردية مفتوحة',
    });
  });

  it('fails clearly when no server is configured', async () => {
    const { http } = client({ getConfig: () => ({ baseUrl: '', token: null }) });
    await expect(http.request('/orders')).rejects.toMatchObject({ status: 0 });
  });

  it('turns a network failure into an Arabic connection error', async () => {
    const { http, fetchImpl } = client();
    fetchImpl.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(http.request('/health')).rejects.toMatchObject({
      status: 0,
      message: 'تعذّر الاتصال بالخادم — راجع العنوان والشبكة',
    });
  });
});
