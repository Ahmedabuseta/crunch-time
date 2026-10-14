// WebSocket client registry for the remote POS server.
// Phones connect to /ws with a token; every mutation is pushed to all of them
// so the order board stays live without polling.
import { WebSocket } from 'ws'

const clients = new Set<WebSocket>()

export function addClient(ws: WebSocket): void {
  clients.add(ws)
}

export function removeClient(ws: WebSocket): void {
  clients.delete(ws)
}

export function closeAllClients(): void {
  for (const ws of clients) {
    try {
      ws.close()
    } catch {
      // already closing
    }
  }
  clients.clear()
}

/** Sends {channel, payload} to every connected phone. */
export function broadcast(channel: string, payload: unknown): void {
  if (clients.size === 0) return
  const data = JSON.stringify({ channel, payload })
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data)
      } catch {
        // a dead socket is dropped by its own close handler
      }
    }
  }
}
