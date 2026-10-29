import { describe, it, expect } from 'vitest';
import { createSseParser, type SseEvent } from './sse';

describe('createSseParser', () => {
  it('emits a single complete event that arrives in one chunk', () => {
    const parser = createSseParser();

    expect(parser.push('event: status\ndata: {"tool":"x"}\n\n')).toEqual([
      { event: 'status', data: '{"tool":"x"}' },
    ]);
  });

  it('emits two events that arrive in the same chunk', () => {
    const parser = createSseParser();

    expect(parser.push('data: one\n\ndata: two\n\n')).toEqual([
      { event: 'message', data: 'one' },
      { event: 'message', data: 'two' },
    ]);
  });

  it('holds an event back while it is split across three chunks', () => {
    const parser = createSseParser();

    // Chunk boundaries fall mid-field-name, then inside the value, then
    // mid-terminator — nothing may surface until the blank line is complete.
    expect(parser.push('eve')).toEqual([]);
    expect(parser.push('nt: status\ndata: {"tool":"x"}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ event: 'status', data: '{"tool":"x"}' }]);
  });

  it('holds a data value that is split mid-string', () => {
    const parser = createSseParser();

    expect(parser.push('event: text\ndata: {"d":"h')).toEqual([]);
    expect(parser.push('i"}\n\n')).toEqual([{ event: 'text', data: '{"d":"hi"}' }]);
  });

  it('joins multiple data lines with a newline', () => {
    const parser = createSseParser();

    expect(parser.push('event: log\ndata: line one\ndata: line two\n\n')).toEqual([
      { event: 'log', data: 'line one\nline two' },
    ]);
  });

  it('accepts CRLF line endings', () => {
    const parser = createSseParser();

    expect(parser.push('event: status\r\ndata: {"tool":"x"}\r\n\r\n')).toEqual([
      { event: 'status', data: '{"tool":"x"}' },
    ]);
  });

  it('accepts a CRLF terminator split across chunks', () => {
    const parser = createSseParser();

    expect(parser.push('event: done\r\ndata: {}\r')).toEqual([]);
    expect(parser.push('\n\r\n')).toEqual([{ event: 'done', data: '{}' }]);
  });

  it('ignores comment lines and emits nothing for a lone keep-alive', () => {
    const parser = createSseParser();

    expect(parser.push(': ping\n\n')).toEqual([]);
    expect(parser.push(': keep-alive\nevent: status\ndata: {}\n\n')).toEqual([
      { event: 'status', data: '{}' },
    ]);
  });

  it('ignores unknown fields such as id and retry', () => {
    const parser = createSseParser();

    expect(parser.push('id: 5\nretry: 1000\nfoo: bar\nevent: status\ndata: {}\n\n')).toEqual([
      { event: 'status', data: '{}' },
    ]);
  });

  it('names events "message" when the stream sends no event line', () => {
    const parser = createSseParser();

    expect(parser.push('data: hello\n\n')).toEqual([{ event: 'message', data: 'hello' }]);
  });

  it('drops a half-received event on reset', () => {
    const parser = createSseParser();

    expect(parser.push('event: status\ndata: {"tool":"x"}\n')).toEqual([]);
    parser.reset();

    // The stale terminator and the stale field must not complete the old event.
    expect(parser.push('\n')).toEqual([]);
    expect(parser.push('data: fresh\n\n')).toEqual([{ event: 'message', data: 'fresh' }]);
  });

  it('never throws on malformed input, and skips it', () => {
    const parser = createSseParser();

    expect(parser.push('')).toEqual([]);
    expect(() => parser.push('garbage with no colon\n:\n:\n\n')).not.toThrow();
    expect(parser.push('garbage with no colon\n:\n\n')).toEqual([]);
    expect(parser.push('data: ok\n\n')).toEqual([{ event: 'message', data: 'ok' }]);
  });

  it('parses a realistic status/text/done stream', () => {
    const parser = createSseParser();

    const events = parser.push(
      'event: status\ndata: {"tool":"x"}\n\n' +
        'event: text\ndata: {"d":"hi"}\n\n' +
        'event: done\ndata: {}\n\n'
    );

    expect(events.map((e) => e.event)).toEqual(['status', 'text', 'done']);
    expect(events.map((e) => JSON.parse(e.data))).toEqual([{ tool: 'x' }, { d: 'hi' }, {}]);
  });

  it('still parses a realistic stream fed one byte-ish chunk at a time', () => {
    const parser = createSseParser();
    const raw =
      'event: status\ndata: {"tool":"x"}\n\n' + 'event: text\ndata: {"d":"hi"}\n\n' + 'event: done\ndata: {}\n\n';

    const events: SseEvent[] = [];
    for (let i = 0; i < raw.length; i += 5) {
      events.push(...parser.push(raw.slice(i, i + 5)));
    }

    expect(events.map((e) => e.event)).toEqual(['status', 'text', 'done']);
    expect(events.map((e) => JSON.parse(e.data))).toEqual([{ tool: 'x' }, { d: 'hi' }, {}]);
  });
});
