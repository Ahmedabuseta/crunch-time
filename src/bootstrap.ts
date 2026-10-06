import { rendererApi } from './db/renderer-db'
import { applyTheme } from './lib/theme'

// Apply saved theme immediately to prevent flash
applyTheme()

// In Electron the preload script already exposes the real window.api bridge
// (contextBridge → IPC → SQLite). Only fall back to the in-memory mock for
// plain-browser dev (vite) where there is no preload.
if (!(window as any).api) {
  ;(window as any).api = rendererApi
}

// No preload in plain-browser dev either — stub the updater bridge so the
// UpdateBanner stays hidden and Settings shows a friendly "dev mode" note.
if (!(window as any).updater) {
  ;(window as any).updater = {
    check: async () => ({ ok: false, error: 'dev' }),
    quitAndInstall: async () => ({ ok: false }),
    onStatus: () => () => {},
  }
}