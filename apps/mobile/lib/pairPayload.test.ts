import { describe, expect, it } from 'vitest';
import { buildPairPayload, pairPayloadFromParams, parsePairPayload } from './pairPayload';

describe('pair payload', () => {
  it('round-trips what the desktop writes into the QR', () => {
    const payload = buildPairPayload('https://shop.tail1a2b.ts.net', '483920');
    expect(parsePairPayload(payload)).toEqual({
      url: 'https://shop.tail1a2b.ts.net',
      code: '483920',
    });
  });

  it('handles an http host:port address', () => {
    const parsed = parsePairPayload(buildPairPayload('http://100.101.102.103:4317', '112233'));
    expect(parsed).toEqual({ url: 'http://100.101.102.103:4317', code: '112233' });
  });

  it('accepts raw JSON as well as the scheme', () => {
    expect(parsePairPayload('{"u":"http://10.0.0.5:4317","c":"999111"}')).toEqual({
      url: 'http://10.0.0.5:4317',
      code: '999111',
    });
    expect(parsePairPayload('{"url":"http://10.0.0.5:4317","code":"999111"}')).toEqual({
      url: 'http://10.0.0.5:4317',
      code: '999111',
    });
  });

  it('accepts a bare URL with no code (PIN login still works)', () => {
    expect(parsePairPayload('http://192.168.1.5:4317')).toEqual({
      url: 'http://192.168.1.5:4317',
      code: null,
    });
  });

  it('rejects anything that is not a POS address', () => {
    expect(parsePairPayload('')).toBeNull();
    expect(parsePairPayload('   ')).toBeNull();
    expect(parsePairPayload('hello world')).toBeNull();
    expect(parsePairPayload('crunchtime://pair?c=123')).toBeNull();
    expect(parsePairPayload('{"c":"123"}')).toBeNull();
    expect(parsePairPayload('{not json}')).toBeNull();
  });

  // The same payload reaches the app two ways. In-app scanning yields the raw
  // string; a system-camera scan lands on the `pair` route, where the router
  // has already split the query into params.
  describe('route params from a system-camera scan', () => {
    it('reads the same keys the QR carries', () => {
      expect(pairPayloadFromParams({ u: 'http://100.101.102.103:4317', c: '483920' })).toEqual({
        url: 'http://100.101.102.103:4317',
        code: '483920',
      });
    });

    it('accepts the long key names too', () => {
      expect(pairPayloadFromParams({ url: 'https://shop.tail1a2b.ts.net', code: '112233' })).toEqual({
        url: 'https://shop.tail1a2b.ts.net',
        code: '112233',
      });
    });

    it('takes the first value when a key repeats', () => {
      expect(pairPayloadFromParams({ u: ['http://10.0.0.5:4317', 'http://10.0.0.9:4317'] })).toEqual({
        url: 'http://10.0.0.5:4317',
        code: null,
      });
    });

    it('treats a missing or blank code as the PIN fallback', () => {
      expect(pairPayloadFromParams({ u: 'http://10.0.0.5:4317', c: '  ' })).toEqual({
        url: 'http://10.0.0.5:4317',
        code: null,
      });
    });

    it('has no url when the link carried none', () => {
      expect(pairPayloadFromParams({})).toBeNull();
      expect(pairPayloadFromParams({ c: '483920' })).toBeNull();
      expect(pairPayloadFromParams({ u: '   ' })).toBeNull();
    });
  });
});
