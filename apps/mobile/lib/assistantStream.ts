// The one streaming call the assistant screen makes.
//
// Free of React, like lib/http.ts, so the screen and its hook share a single
// implementation of the handshake and the framing lives where it already is
// (`createSseParser`).
//
// `expo/fetch`, not the global fetch: only it hands back a real
// `ReadableStream` body on device. With the plain fetch the whole answer
// arrives at once, which turns a streamed reply into a long silence followed by
// a wall of text.
import type { ChatCard } from '@/api/types';
import { createSseParser, type SseEvent } from '@/lib/sse';
import { fetch as expoFetch } from 'expo/fetch';

/** What the `done` event carries, and what the buffered route answers with. */
export interface StreamDonePayload {
  messageId: string;
  cards: ChatCard[];
  followups: string[];
  blocked?: string;
}

export interface StreamHandlers {
  /** A tool started running, e.g. `inventory_status` → «بيراجع المخزون…». */
  onStatus?: (tool: string) => void;
  onText?: (delta: string) => void;
  onDone?: (payload: StreamDonePayload) => void;
  onError?: (err: { code: string; message: string }) => void;
}

export interface StreamArgs {
  baseUrl: string;
  token: string;
  message: string;
  signal?: AbortSignal;
}

const DEFAULT_ERROR = 'المساعد مقدرش يرد — جرب تاني';

/** The server's Arabic `{ error }`, or a status-shaped fallback. */
async function readErrorMessage(
  response: { text: () => Promise<string> },
  fallback: string
): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return fallback;
    const payload = JSON.parse(text);
    return typeof payload?.error === 'string' && payload.error ? payload.error : fallback;
  } catch {
    // A non-JSON body (a proxy page, an empty 502) must not mask the status.
    return fallback;
  }
}

function parseJson(data: string): any {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const cardList = (value: unknown): ChatCard[] => (Array.isArray(value) ? (value as ChatCard[]) : []);

export async function streamChat(args: StreamArgs, handlers: StreamHandlers): Promise<void> {
  const baseUrl = args.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.token}`,
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  };
  const body = JSON.stringify({ message: args.message });

  const response = await expoFetch(`${baseUrl}/assistant/chat?stream=1`, {
    method: 'POST',
    headers,
    body,
    signal: args.signal ?? null,
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `المساعد مقدرش يرد (${response.status})`)
    );
  }

  // Some responses (a proxy that buffered, a platform without streams) carry no
  // body stream at all. Rather than show the owner an empty answer, ask the
  // server for the same reply as one JSON body and land it in one go.
  if (!response.body) {
    await readBuffered(baseUrl, headers, args, handlers);
    return;
  }

  const dispatch = (event: SseEvent): void => {
    const data = parseJson(event.data);
    switch (event.event) {
      case 'status':
        if (typeof data?.tool === 'string') handlers.onStatus?.(data.tool);
        break;
      case 'text':
        if (typeof data?.d === 'string' && data.d) handlers.onText?.(data.d);
        break;
      case 'done':
        handlers.onDone?.({
          messageId: typeof data?.messageId === 'string' ? data.messageId : '',
          cards: cardList(data?.cards),
          followups: stringList(data?.followups),
          blocked: typeof data?.blocked === 'string' ? data.blocked : undefined,
        });
        break;
      case 'error':
        handlers.onError?.({
          code: typeof data?.code === 'string' ? data.code : 'unknown',
          message: typeof data?.message === 'string' ? data.message : DEFAULT_ERROR,
        });
        break;
      default:
        // An event this build has never heard of (a newer server, a keep-alive
        // with a name) must never break the stream.
        break;
    }
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // `stream: true` keeps a multi-byte character split across two chunks
      // buffered instead of decoding it into two replacement glyphs.
      for (const event of parser.push(decoder.decode(value, { stream: true }))) dispatch(event);
    }
    // Flush whatever the decoder still holds once the stream is over.
    for (const event of parser.push(decoder.decode())) dispatch(event);
  } finally {
    // Releases the native stream so an aborted turn stops reading immediately.
    try {
      reader.releaseLock();
    } catch {
      // Already released or errored — nothing to undo.
    }
  }
}

/**
 * The no-stream fallback: the same turn over `?stream=0`, which answers with one
 * JSON body. The contract fixes which fields come back but not whether they sit
 * at the top level or under a `message` row, so both are accepted.
 */
async function readBuffered(
  baseUrl: string,
  headers: Record<string, string>,
  args: StreamArgs,
  handlers: StreamHandlers
): Promise<void> {
  const response = await expoFetch(`${baseUrl}/assistant/chat?stream=0`, {
    method: 'POST',
    headers: { ...headers, Accept: 'application/json' },
    body: JSON.stringify({ message: args.message }),
    signal: args.signal ?? null,
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `المساعد مقدرش يرد (${response.status})`)
    );
  }

  const payload: any = await response.json();
  const record =
    payload?.message && typeof payload.message === 'object' ? payload.message : (payload ?? {});

  const content = typeof record.content === 'string' ? record.content : '';
  if (content) handlers.onText?.(content);

  handlers.onDone?.({
    messageId:
      typeof record.id === 'string'
        ? record.id
        : typeof record.messageId === 'string'
          ? record.messageId
          : '',
    cards: cardList(record.cards),
    followups: stringList(record.followups),
    blocked: typeof record.blocked === 'string' ? record.blocked : undefined,
  });
}
