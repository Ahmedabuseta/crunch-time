import { api } from '@/api/endpoints';
import {
  clearSession,
  loadApiConfig,
  setServerUrl,
  setToken,
  setUnauthorizedHandler,
} from '@/api/client';
import { resetQueryCache } from '@/lib/queryClient';
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
  /** Lets the owner watch the intro again from المزيد. */
  resetOnboarding: () => Promise<void>;
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
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      // Whatever happens — a slow keychain, a missing native module — the app
      // must become usable. A hang here would be a permanent blank screen.
      try {
        const [cfg, done] = await Promise.all([loadApiConfig(), storage.getOnboardingDone()]);
        if (!mounted) return;
        const hasServer = Boolean(cfg.baseUrl);
        if (__DEV__) {
          console.log('[session] boot', {
            onboardingDone: done && hasServer,
            hasServer,
            hasToken: Boolean(cfg.token),
          });
        }
        setServerUrlState(cfg.baseUrl);
        setSignedIn(Boolean(cfg.token));
        // "Onboarding done" only means something once the install is actually
        // set up. A stored flag from an intro that was skipped before ever
        // connecting must not hide the intro for good, so it counts only
        // alongside a server address.
        setOnboardingDone(done && hasServer);
      } catch {
        if (mounted) setOnboardingDone(false);
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Any 401 (expired token, PIN changed on the PC) drops us back to setup, and
  // takes the cached business data with it.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void resetQueryCache();
      setSignedIn(false);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const completeOnboarding = useCallback(async () => {
    await storage.setOnboardingDone(true);
    setOnboardingDone(true);
  }, []);

  const resetOnboarding = useCallback(async () => {
    await storage.setOnboardingDone(false);
    setOnboardingDone(false);
  }, []);

  const connect = useCallback(async (url: string) => {
    const saved = await setServerUrl(url);
    setServerUrlState(saved);
    // A different server means a different shop: nothing cached still applies.
    await resetQueryCache();
    await api.health();
    // Reaching a live server is what "set up" means, so this — not the intro
    // being dismissed — is where the onboarding flag is recorded.
    await storage.setOnboardingDone(true);
    setOnboardingDone(true);
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
    await resetQueryCache();
    await clearSession();
    setSignedIn(false);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ ready, serverUrl, signedIn, onboardingDone, completeOnboarding, resetOnboarding, connect, pair, signIn, signOut }),
    [ready, serverUrl, signedIn, onboardingDone, completeOnboarding, resetOnboarding, connect, pair, signIn, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
