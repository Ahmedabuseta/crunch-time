// The bridge between a running activity and the SSE response.
//
// Temporal has no push-to-client channel, and it should not: the workflow is
// the durable record, this registry is the live view. A phone that disconnects
// simply unsubscribes — the activity keeps going and `persistTurn` still stores
// the answer, so reopening the screen shows the finished turn.
export type TurnEvent =
  | { type: 'status'; tool: string }
  /**
   * Answer text. A plain `delta` appends; `replace` resets the bubble to `d`,
   * which is how the final, guarded answer overrides a streamed draft.
   */
  | { type: 'text'; delta: string; replace?: boolean }
  /** The model's reasoning, token by token. */
  | { type: 'thinking'; delta: string }
  | { type: 'done'; payload: unknown }
  | { type: 'error'; code: string; message: string }

type Listener = (event: TurnEvent) => void

const listeners = new Map<string, Set<Listener>>()

/** Returns the unsubscribe function. Safe to call twice. */
export function subscribe(turnId: string, listener: Listener): () => void {
  let set = listeners.get(turnId)
  if (!set) {
    set = new Set()
    listeners.set(turnId, set)
  }
  set.add(listener)
  return () => {
    const current = listeners.get(turnId)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) listeners.delete(turnId)
  }
}

export function publish(turnId: string, event: TurnEvent): void {
  const set = listeners.get(turnId)
  if (!set || set.size === 0) return
  for (const listener of set) {
    try {
      listener(event)
    } catch {
      // A dead response must not take the turn down with it.
    }
  }
}

export function publishText(turnId: string, delta: string): void {
  if (!delta) return
  publish(turnId, { type: 'text', delta })
}

/**
 * Publishes the authoritative answer, replacing whatever was streamed.
 *
 * The streamed draft is the model's first attempt; the number guard may reject
 * it and the workflow then persists a repaired answer. Sending that as a
 * replacement — rather than appending — is what keeps an invented figure out of
 * the transcript while still giving the owner a live bubble.
 */
export function publishFinalText(turnId: string, text: string): void {
  if (!text) return
  publish(turnId, { type: 'text', delta: text, replace: true })
}

export function publishStatus(turnId: string, tool: string): void {
  publish(turnId, { type: 'status', tool })
}

export function publishThinking(turnId: string, delta: string): void {
  if (!delta) return
  publish(turnId, { type: 'thinking', delta })
}

export function publishDone(turnId: string, payload: unknown): void {
  publish(turnId, { type: 'done', payload })
}

export function publishError(turnId: string, code: string, message: string): void {
  publish(turnId, { type: 'error', code, message })
}

/** Drops the listener set once the response is finished. */
export function closeTurn(turnId: string): void {
  listeners.delete(turnId)
}

export function activeTurns(): number {
  return listeners.size
}
