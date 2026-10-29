// The assistant screen's state machine: the message list, the single in-flight
// turn, and the confirm/cancel round trips for action cards.
//
// All of it lives here rather than in the screen so the screen stays a layout
// file, and so the streaming nuance (optimistic user line, partial text, the
// abort controller that has to die on unmount) has one owner.
import { getApiBaseUrl, getToken } from '@/api/client';
import { api } from '@/api/endpoints';
import type { ActionChatCard, ChatActionStatus, ChatMessage } from '@/api/types';
import { streamChat } from '@/lib/assistantStream';
import { useCallback, useEffect, useRef, useState } from 'react';

/** How many past messages the screen opens with. */
const HISTORY_LIMIT = 50;

/**
 * Streaming text is published at most this often.
 *
 * A fast provider emits dozens of deltas a second, and each one would re-render
 * the whole screen — which is what makes an old Android handset stutter. Ten
 * updates a second is indistinguishable from token-by-token to the eye and an
 * order of magnitude cheaper.
 */
const STREAM_FLUSH_MS = 90;

/**
 * Tool name → the line shown while it runs. The server sends the tool id, never
 * prose, so the wording stays the phone's.
 */
const TOOL_STATUS: Record<string, string> = {
  sales_summary: 'بيراجع المبيعات…',
  profit_summary: 'بيحسب الأرباح…',
  top_items: 'بيشوف الأكثر مبيعاً…',
  inventory_status: 'بيراجع المخزون…',
  item_margins: 'بيحسب هوامش الربح…',
  recipe_costs: 'بيراجع تكلفة المكونات…',
  staff_performance: 'بيراجع أداء الموظفين…',
  orders_search: 'بيدوّر في الطلبات…',
  set_product_price: 'بيجهّز تعديل السعر…',
  restock: 'بيجهّز الاستلام…',
  adjust_stock: 'بيجهّز تسوية المخزون…',
  record_waste: 'بيجهّز تسجيل التالف…',
  exchange_brand: 'بيجهّز المبادلة…',
};

const DEFAULT_STATUS = 'بيفكر…';

function statusForTool(tool: string): string {
  return TOOL_STATUS[tool] ?? DEFAULT_STATUS;
}

/** The server's Arabic message, or something honest when it is not an Error. */
function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'حصل خطأ غير متوقع';
}

const isAbort = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError';

/**
 * A client-side id for a line that has not been to the server yet. The server
 * hands out the ids it stores; these only have to be unique on this screen.
 */
let localSequence = 0;
function localId(role: string): string {
  localSequence += 1;
  return `${role}-${Date.now()}-${localSequence}`;
}

export function useAssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [partial, setPartial] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // A ref, not the `streaming` state: `send` is called from press handlers, and
  // a state value captured in a callback can be one render behind.
  const activeRef = useRef<AbortController | null>(null);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || activeRef.current) return;

    const controller = new AbortController();
    activeRef.current = controller;

    setMessages((prev) => [
      ...prev,
      {
        id: localId('user'),
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      },
    ]);
    setStreaming(true);
    setPartial('');
    setStatus(null);
    setError(null);

    // Accumulated outside state: the `done` handler and the cleanup below both
    // need the final text in the same tick it arrives.
    let content = '';
    let settled = false;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      await streamChat(
        {
          baseUrl: getApiBaseUrl(),
          token: getToken() ?? '',
          message: text,
          signal: controller.signal,
        },
        {
          onStatus: (tool) => setStatus(statusForTool(tool)),
          onText: (delta) => {
            content += delta;
            // Coalesce: the first delta of a window schedules the flush, the
            // rest just extend the buffer.
            if (flushTimer) return;
            flushTimer = setTimeout(() => {
              flushTimer = null;
              setPartial(content);
            }, STREAM_FLUSH_MS);
          },
          onDone: (payload) => {
            settled = true;
            setMessages((prev) => [
              ...prev,
              {
                id: payload.messageId || localId('assistant'),
                role: 'assistant',
                content,
                cards: payload.cards,
                followups: payload.followups,
                createdAt: new Date().toISOString(),
                blocked: payload.blocked,
              },
            ]);
          },
          onError: (err) => setError(err.message),
        }
      );
    } catch (err) {
      // An abort is the owner pressing stop, not a failure worth shouting about.
      if (!isAbort(err)) setError(messageOf(err));
    } finally {
      // Drop a pending flush: the final text is either in a message already or
      // about to be, so publishing a last partial would only cause a flash.
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      // A turn that ended without `done` — a dropped socket, the server's own
      // error event — still holds text worth keeping, so it lands as a message
      // instead of vanishing. An aborted turn is deliberately dropped.
      if (!settled && content && !controller.signal.aborted) {
        setMessages((prev) => [
          ...prev,
          {
            id: localId('assistant'),
            role: 'assistant',
            content,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      activeRef.current = null;
      setStreaming(false);
      setStatus(null);
      setPartial('');
    }
  }, []);

  const abort = useCallback(() => {
    activeRef.current?.abort();
  }, []);

  // A turn outliving the screen would keep writing state after unmount.
  useEffect(
    () => () => {
      activeRef.current?.abort();
      activeRef.current = null;
    },
    []
  );

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const { messages: history } = await api.assistant.history({ limit: HISTORY_LIMIT });
        if (!alive) return;
        // The route pages backwards from the newest message; the screen reads
        // oldest-first. Sorting rather than trusting the order keeps the
        // transcript right whichever way the server pages.
        const sorted = [...history].sort((a, b) =>
          String(a.createdAt).localeCompare(String(b.createdAt))
        );
        // Never overwrite a line the owner has already sent: the history can
        // land after the first turn on a slow connection.
        setMessages((prev) => (prev.length > 0 ? prev : sorted));
      } catch {
        // An empty thread and an unreachable server look identical on a first
        // open — the screen offers its example prompts either way.
      } finally {
        if (alive) setLoadingHistory(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /** Replaces one card's status in place, leaving every other line untouched. */
  const replaceAction = useCallback(
    (actionId: string, next: { status: ChatActionStatus; result?: string }) => {
      setMessages((prev) =>
        prev.map((message) => {
          if (!message.cards?.some((card) => card.kind === 'action' && card.actionId === actionId)) {
            return message;
          }
          return {
            ...message,
            cards: message.cards.map((card) =>
              card.kind === 'action' && card.actionId === actionId
                ? { ...card, status: next.status, result: next.result ?? card.result }
                : card
            ),
          };
        })
      );
    },
    []
  );

  const confirm = useCallback(
    async (card: ActionChatCard) => {
      try {
        const result = await api.assistant.confirmAction(card.actionId);
        // A refusal keeps the row proposed (nothing ran), so the error has to
        // replace the preview text or the card would look untouched.
        replaceAction(card.actionId, {
          status: result.status,
          result: result.ok ? undefined : (result.message ?? result.error),
        });
      } catch (err) {
        // The request never reached a decision; 'failed' is the only status
        // that still offers a retry, which is exactly what the owner needs.
        replaceAction(card.actionId, { status: 'failed', result: messageOf(err) });
      }
    },
    [replaceAction]
  );

  const cancel = useCallback(
    async (card: ActionChatCard) => {
      try {
        const result = await api.assistant.cancelAction(card.actionId);
        replaceAction(card.actionId, { status: result.status });
      } catch (err) {
        replaceAction(card.actionId, { status: 'failed', result: messageOf(err) });
      }
    },
    [replaceAction]
  );

  /** Empties the thread here and on the server, so a reopen stays empty. */
  const clear = useCallback(async () => {
    try {
      await api.assistant.clearHistory();
      setMessages([]);
      setPartial('');
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, []);

  return {
    messages,
    streaming,
    partial,
    status,
    error,
    loadingHistory,
    send,
    abort,
    confirm,
    cancel,
    clear,
  };
}
