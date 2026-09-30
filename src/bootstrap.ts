import { rendererApi } from './db/renderer-db'

// In Electron the preload script already exposes the real window.api bridge
// (contextBridge → IPC → SQLite). Only fall back to the in-memory mock for
// plain-browser dev (vite) where there is no preload.
if (!(window as any).api) {
  ;(window as any).api = rendererApi
}