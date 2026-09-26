import type { Socket } from 'socket.io-client';

/** Odpowiedź serwera na zdarzenie z potwierdzeniem (`SocketAck` w `shared`). */
export type Ack<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Surowa intencja z gniazda aktora (`Actor.socket()`), z czekaniem na ack —
 * do sprawdzania odmów serwera bez UI, które by je wyszarzyło (`testy.md` 6.2).
 */
export function emitAck<T = unknown>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 10_000,
): Promise<Ack<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`E2E: no ack for ${event}`)), timeoutMs);
    socket.emit(event, payload, (ack: Ack<T>) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}
