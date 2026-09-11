import { initRendererDb, rendererApi } from './db/renderer-db'

// Initialize SQLite (async — WASM loading), then expose as window.api
export async function bootstrap() {
  await initRendererDb()
  ;(window as any).api = rendererApi
}
