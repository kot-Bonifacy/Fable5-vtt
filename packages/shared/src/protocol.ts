/** Server → client payload confirming a successful Socket.IO handshake. */
export interface ServerHello {
  serverTime: string;
  version: string;
}

export const PROTOCOL_VERSION = '0.1.0';

export function createServerHello(now: Date = new Date()): ServerHello {
  return {
    serverTime: now.toISOString(),
    version: PROTOCOL_VERSION,
  };
}
