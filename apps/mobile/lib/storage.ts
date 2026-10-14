import * as SecureStore from 'expo-secure-store';

// SecureStore keeps the PIN-derived token in the device keychain. It has no web
// implementation, so every access degrades to a no-op rather than throwing —
// the app still runs in a browser preview, it just forgets between reloads.
const KEYS = {
  serverUrl: 'ct.serverUrl',
  token: 'ct.token',
  onboarding: 'ct.onboardingDone',
} as const;

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // no keychain (web) — the in-memory config still works for this session
  }
}

export const storage = {
  getServerUrl: () => read(KEYS.serverUrl),
  setServerUrl: (value: string | null) => write(KEYS.serverUrl, value),

  getToken: () => read(KEYS.token),
  setToken: (value: string | null) => write(KEYS.token, value),

  getOnboardingDone: async () => (await read(KEYS.onboarding)) === '1',
  setOnboardingDone: (done: boolean) => write(KEYS.onboarding, done ? '1' : null),
};
