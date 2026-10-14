// Server event fan-out. One call reaches both audiences:
//  - connected phones, over the WebSocket;
//  - the desktop renderer, via a notifier the main process registers
//    (webContents.send), so a phone sale shows up on the PC order board live.
import { broadcast } from './ws'

type DesktopNotifier = (channel: string, payload: unknown) => void

let notifier: DesktopNotifier | null = null

export function setDesktopNotifier(fn: DesktopNotifier | null): void {
  notifier = fn
}

export function emitEvent(channel: string, payload: unknown): void {
  broadcast(channel, payload)
  try {
    notifier?.(channel, payload)
  } catch {
    // a closed window must never break a sale
  }
}
