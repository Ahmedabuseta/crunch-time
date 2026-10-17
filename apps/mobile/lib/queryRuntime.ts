// Teaches React Query about the phone. On native it has no `navigator` and no
// `focus` events, so without this wiring it believes it is always online and
// never refetches on foreground — the offline behaviour would be dead.
import { networkStateToOnline } from '@/lib/cachePolicy';
import { focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

let installed = false;

/** Idempotent: safe to call from a module top level. */
export function installQueryRuntime(): void {
  if (installed) return;
  installed = true;

  onlineManager.setEventListener((setOnline) => {
    void Network.getNetworkStateAsync()
      .then((state) => setOnline(networkStateToOnline(state)))
      .catch(() => {
        // No network module reading — stay online rather than lie about it.
      });
    const subscription = Network.addNetworkStateListener((state) =>
      setOnline(networkStateToOnline(state))
    );
    return () => subscription.remove();
  });

  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (status) =>
      handleFocus(status === 'active')
    );
    return () => subscription.remove();
  });
}
