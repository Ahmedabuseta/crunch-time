import { rendererApi } from './db/renderer-db'

// Expose renderer DB as window.api (same shape as IPC preload)
;(window as any).api = rendererApi
