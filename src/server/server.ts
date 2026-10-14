// Fastify + WebSocket server for the remote POS (the owner's phone app).
//
// Started from the main process after migrations, and only while the Settings
// Remote card is enabled — it binds 0.0.0.0 so the phone can reach it over the
// shop LAN (and later Tailscale). All business logic is reused from
// src/backend/*, so the phone drives the exact same code as the desktop.
import Fastify, { type FastifyInstance } from 'fastify'
import { WebSocketServer, WebSocket } from 'ws'
import { networkInterfaces } from 'os'
import type { Backend } from '../backend'
import { getRemoteConfig } from '../backend/settings'
import { registerRoutes } from './routes'
import { extractToken, verifyToken } from './tokens'

export interface StartResult {
  ok: boolean
  port?: number
  error?: string | null
}

let app: FastifyInstance | null = null
let wss: WebSocketServer | null = null
let boundPort: number | null = null
let lastError: string | null = null
const clients = new Set<WebSocket>()

/** Push a server event to every connected phone (order board updates, …). */
export function broadcast(channel: string, payload: unknown): void {
  if (!wss || clients.size === 0) return
  const data = JSON.stringify({ channel, payload })
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data)
      } catch {
        // a dead socket is removed by its own close handler
      }
    }
  }
}

function lanAddresses(port: number): string[] {
  const out: string[] = []
  const ifaces = networkInterfaces()
  for (const list of Object.values(ifaces)) {
    for (const info of list || []) {
      if (info.family === 'IPv4' && !info.internal) out.push(`${info.address}:${port}`)
    }
  }
  return out
}

export function getRemoteServerStatus() {
  return { running: app !== null, port: boundPort, addresses: boundPort ? lanAddresses(boundPort) : [], error: lastError }
}

/** Starts the server on the configured port. No-op when disabled. */
export async function startRemoteServer(backend: Backend): Promise<StartResult> {
  const cfg = getRemoteConfig()
  if (!cfg.enabled) {
    await stopRemoteServer()
    return { ok: true }
  }
  // Already serving the requested port — nothing to do.
  if (app && boundPort === cfg.port) return { ok: true, port: cfg.port }
  if (app) await stopRemoteServer()

  const instance = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 })
  registerRoutes(instance, backend)

  const socketServer = new WebSocketServer({ noServer: true })
  instance.server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`)
    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }
    const token = extractToken(req.headers.authorization, url.searchParams.get('token'))
    if (!verifyToken(token, getRemoteConfig().secret)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    socketServer.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws)
      const drop = () => clients.delete(ws)
      ws.on('close', drop)
      ws.on('error', drop)
    })
  })

  try {
    await instance.listen({ host: '0.0.0.0', port: cfg.port })
  } catch (err: any) {
    try {
      socketServer.close()
    } catch {
      // best effort
    }
    lastError = err?.code === 'EADDRINUSE'
      ? `البورت ${cfg.port} مستخدم بالفعل — اختر بورت تاني`
      : (err?.message || 'تعذّر تشغيل الخادم')
    return { ok: false, error: lastError }
  }

  app = instance
  wss = socketServer
  boundPort = cfg.port
  lastError = null
  return { ok: true, port: cfg.port }
}

export async function stopRemoteServer(): Promise<void> {
  for (const ws of clients) {
    try {
      ws.close()
    } catch {
      // already closing
    }
  }
  clients.clear()
  if (wss) {
    try {
      wss.close()
    } catch {
      // best effort
    }
    wss = null
  }
  if (app) {
    try {
      await app.close()
    } catch {
      // best effort
    }
    app = null
  }
  boundPort = null
}
