import { rendererApi } from './db/renderer-db'

// Pure JS store — no async init needed
;(window as any).api = rendererApi
