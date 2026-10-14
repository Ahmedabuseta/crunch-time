import { api } from '@/api/endpoints';
import {
  clearSession,
  loadApiConfig,
  setServerUrl,
  setToken,
  setUnauthorizedHandler,
} from '@/api/client';
import { storage } from '@/lib/storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface SessionValue {
  /** False until the persisted config has been read. */
  ready: boolean;
  serverUrl: string;
  signedIn: boolean;
  onboardingDone: boolean;
  completeOnboarding: () => Promise<void>;
  /** Saves the address and probes /health. Throws ApiError when unreachable. */
  connect: (url: string) => Promise<void>;
  /** Address + one-time pairing code from the QR — signs in without a PIN. */
  pair: (url: string, code: string) => Promise<void>;
  signIn: (pin: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [serverUrl, setServerUrlState] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [cfg, done] = await Promise.all([loadApiConfig(), storage.getOnboardingDone()]);
      if (!mounted) return;
      setServerUrlState(cfg.baseUrl);
      setSignedIn(Boolean(cfg.token));
      setOnboardingDone(done);
      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Any 401 (expired token, PIN changed on the PC) drops us back to setup.
  useEffect(() => {
    setUnauthorizedHandler(() => setSignedIn(false));
    return () => setUnauthorizedHandler(null);
  }, []);

  const completeOnboarding = useCallback(async () => {
    await storage.setOnboardingDone(true);
    setOnboardingDone(true);
  }, []);

  const connect = useCallback(async (url: string) => {
    const saved = await setServerUrl(url);
    setServerUrlState(saved);
    await api.health();
  }, []);

  const signIn = useCallback(async (pin: string) => {
    const res = await api.login(pin);
    await setToken(res.token);
    setSignedIn(true);
  }, []);

  const pair = useCallback(
    async (url: string, code: string) => {
      await connect(url);
      const res = await api.pair(code);
      await setToken(res.token);
      setSignedIn(true);
    },
    [connect]
  );

  const signOut = useCallback(async () => {
    await clearSession();
    setSignedIn(false);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ ready, serverUrl, signedIn, onboardingDone, completeOnboarding, connect, pair, signIn, signOut }),
    [ready, serverUrl, signedIn, onboardingDone, completeOnboarding, connect, pair, signIn, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
