// Server-Sent Events framing for the remote POS API's streaming endpoints.
// Deliberately free of React Native imports, like http.ts, so the awkward part —
// reassembling events across arbitrary chunk boundaries — can be unit-tested by
// the repo's existing vitest runner. The fetch/ReadableStream wiring lives with
// the caller.
//
// push() takes already-decoded strings. A network read can end anywhere: in the
// middle of a field name, a value, or the blank line that ends the event, so
// everything is buffered until a terminator actually arrives.

export interface SseEvent {
  event: string;
  data: string;
}

export interface SseParser {
  /** Feeds one network chunk; returns the events that became complete in it. */
  push(chunk: string): SseEvent[];
  /** Drops a half-received event, e.g. when the connection is respawned. */
  reset(): void;
}

const DEFAULT_EVENT = 'message';

export function createSseParser(): SseParser {
  let buffer = '';
  let eventName = '';
  let dataLines: string[] = [];

  /** Ends the event in flight; null when it carries no data to deliver. */
  function dispatch(): SseEvent | null {
    const name = eventName || DEFAULT_EVENT;
    const data = dataLines.join('\n');
    eventName = '';
    dataLines = [];
    // Keep-alives (`: ping\n\n`) and stray blank lines get here with nothing
    // buffered — emitting an empty message would confuse every consumer.
    return data ? { event: name, data } : null;
  }

  /** Reads one complete line (line ending already stripped) into the event. */
  function consume(line: string): void {
    if (line.startsWith(':')) return; // comment / keep-alive

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    // Per the SSE framing rules a single space after the colon is not data.
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') eventName = value;
    else if (field === 'data') dataLines.push(value);
    // `id:`, `retry:` and anything unknown are ignored: reconnection belongs
    // to the caller, and an unrecognised field must never break the stream.
  }

  function push(chunk: string): SseEvent[] {
    const events: SseEvent[] = [];
    if (typeof chunk !== 'string' || chunk === '') return events;

    buffer += chunk;

    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline === -1) break;

      let line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      // Tolerate CRLF, including the CR stranded at the end of a chunk that
      // split the pair: the LF arrives next call and we strip it here.
      if (line.endsWith('\r')) line = line.slice(0, -1);

      if (line === '') {
        const event = dispatch();
        if (event) events.push(event);
      } else {
        consume(line);
      }
    }

    return events;
  }

  function reset(): void {
    buffer = '';
    eventName = '';
    dataLines = [];
  }

  return { push, reset };
}
