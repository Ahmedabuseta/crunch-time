import { ApiError } from '@/api/client';
import type { PairPayload } from '@/lib/pairPayload';
import { useSession } from '@/lib/session';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * Turns an address plus a pairing code into a signed-in session. Shared by the
 * in-app scanner and the `crunchtime://pair` deep link, so a code behaves the
 * same whichever way the owner got it into the app.
 */
export function usePairing() {
  const router = useRouter();
  const { pair, connect } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reportError = useCallback((message: string) => setError(message), []);

  const run = useCallback(
    async (payload: PairPayload) => {
      setBusy(true);
      setError('');
      try {
        if (payload.code) {
          await pair(payload.url, payload.code);
          router.replace('/board');
        } else {
          // A bare address — remember it and let the owner type the PIN.
          await connect(payload.url);
          router.replace('/setup');
        }
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'تعذّر الربط — جرّب كود جديد من الكمبيوتر'
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [connect, pair, router]
  );

  return { busy, error, reportError, run };
}
