// Wires the plain HTTP core (lib/http.ts) to the device: persisted config in
// SecureStore, the phone's model as the audit device label, and a 401 hook the
// session provider uses to bounce back to setup.
import { storage } from '@/lib/storage';
import { ApiError, createHttpClient, normalizeBaseUrl } from '@/lib/http';
import * as Device from 'expo-device';

interface Config {
  baseUrl: string;
  token: string | null;
}

let config: Config = { baseUrl: '', token: null };
let unauthorizedHandler: (() => void) | null = null;

const http = createHttpClient({
  getConfig: () => config,
  onTokenRefresh: (token) => {
    config.token = token;
    void storage.setToken(token);
  },
  onUnauthorized: () => unauthorizedHandler?.(),
  deviceLabel: () => Device.modelName ?? Device.deviceName ?? undefined,
});

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export function getApiBaseUrl(): string {
  return config.baseUrl;
}

/** The bearer token, e.g. to authenticate the live-events socket. */
export function getToken(): string | null {
  return config.token;
}

export function hasToken(): boolean {
  return Boolean(config.token);
}

/** Reads the persisted server URL + token into memory (call once at boot). */
export async function loadApiConfig(): Promise<Config> {
  const [url, token] = await Promise.all([storage.getServerUrl(), storage.getToken()]);
  config = { baseUrl: url ?? '', token };
  return config;
}

export async function setServerUrl(raw: string): Promise<string> {
  const baseUrl = normalizeBaseUrl(raw);
  config.baseUrl = baseUrl;
  await storage.setServerUrl(baseUrl || null);
  return baseUrl;
}

export async function setToken(token: string | null): Promise<void> {
  config.token = token;
  await storage.setToken(token);
}

export async function clearSession(): Promise<void> {
  await setToken(null);
}

/** The configured client. Every endpoint call goes through it. */
export const request = http.request;

export { ApiError, normalizeBaseUrl };
