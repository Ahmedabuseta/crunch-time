// Public surface of the remote POS server for the main process.
import type { Backend } from '../backend'
import { getRemoteConfig } from '../backend/settings'
import { getRemoteServerStatus, startRemoteServer, stopRemoteServer } from './server'

export { startRemoteServer, stopRemoteServer, getRemoteServerStatus, broadcast } from './server'
export type { StartResult } from './server'

/**
 * Reads the Remote settings and starts/stops the server to match. Called at
 * boot (after migrations) and again whenever the Remote card is saved, so the
 * port can never stay open when the toggle is off.
 */
export async function applyRemoteServer(backend: Backend) {
  const cfg = getRemoteConfig()
  if (!cfg.enabled) {
    await stopRemoteServer()
    return { ok: true as const }
  }
  return startRemoteServer(backend)
}

/** Status for the Settings card: stored config + live server state. */
export function getRemoteStatus() {
  const cfg = getRemoteConfig()
  const live = getRemoteServerStatus()
  return {
    enabled: cfg.enabled,
    port: cfg.port,
    hasPin: Boolean(cfg.pinHash),
    running: live.running,
    addresses: live.addresses,
    error: live.error,
  }
}
