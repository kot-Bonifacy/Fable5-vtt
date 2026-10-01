import type { Socket } from 'socket.io-client';

/** Odpowiedź serwera na zdarzenie z potwierdzeniem (`SocketAck` w `shared`). */
export type Ack<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Surowa intencja z gniazda aktora (`Actor.socket()`), z czekaniem na ack —
 * do sprawdzania odmów serwera bez UI, które by je wyszarzyło (`testy.md` 6.2).
 *
 * Odmowę `RATE_LIMITED` (limit tempa per konto, #13 z 01.10) ponawia po chwili,
 * jak zrobiłby to człowiek: test, który w pętli sprawdza dziesiątki zdarzeń,
 * pyta o ich odpowiedź, a nie o limit. Sam limit mierzy surowy zalew w 6.2.4.
 */
export async function emitAck<T = unknown>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 10_000,
): Promise<Ack<T>> {
  for (let attempt = 0; ; attempt += 1) {
    const ack = await emitOnce<T>(socket, event, payload, timeoutMs);
    if (ack.ok || ack.error !== 'RATE_LIMITED' || attempt >= RATE_LIMIT_RETRIES) return ack;
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_BACKOFF_MS));
  }
}

/** Wiadro serwera dolewa 20 żetonów na sekundę — 250 ms to pięć zdarzeń zapasu. */
export const RATE_LIMIT_BACKOFF_MS = 250;
export const RATE_LIMIT_RETRIES = 40;

function emitOnce<T>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs: number,
): Promise<Ack<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`E2E: no ack for ${event}`)), timeoutMs);
    socket.emit(event, payload, (ack: Ack<T>) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}
