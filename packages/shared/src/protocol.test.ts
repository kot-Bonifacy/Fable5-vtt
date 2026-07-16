import { describe, expect, it } from 'vitest';
import { createServerHello, PROTOCOL_VERSION } from './protocol.js';

describe('createServerHello', () => {
  it('returns the protocol version and the given time as ISO string', () => {
    const now = new Date('2026-07-16T12:00:00.000Z');
    const hello = createServerHello(now);
    expect(hello.version).toBe(PROTOCOL_VERSION);
    expect(hello.serverTime).toBe('2026-07-16T12:00:00.000Z');
  });
});
