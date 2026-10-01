import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { AuthEndedPush, AuthEndedReason } from '@vtt/shared';

/**
 * Gniazdo żyje tyle, co sesja, która je otworzyła (#11, 01.10).
 *
 * Do tej pory sesję sprawdzał wyłącznie `io.use` przy nawiązaniu połączenia:
 * po wylogowaniu (wiersz `Session` znika, HTTP daje 401) i po wygaśnięciu sesji
 * otwarte gniazdo dalej wysyłało `chat:send` i odbierało cały stół. Teraz:
 *
 * - **wylogowanie** rozłącza wszystkie gniazda tej sesji (`endSessionSockets`,
 *   pokój `session:<id>`), a nie tylko kartę, w której kliknięto „Wyloguj";
 * - **wygaśnięcie** rozłącza gniazdo zegarem ustawionym na `expiresAt`, a każde
 *   zdarzenie, które zdąży przed zegarem, dostaje odmowę `SESSION_ENDED`.
 *
 * Przed rozłączeniem gniazdo dostaje `auth:ended` z powodem — klient wraca na
 * ekran logowania z notką, zamiast wisieć na „rozłączono".
 */

/** setTimeout przyjmuje najwyżej 2^31 − 1 ms (~24,8 doby); sesja żyje rok. */
const MAX_TIMER_MS = 2_000_000_000;

/** Socket.IO room of every socket opened by one session. */
export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

/** Tells the client why, then closes the socket (no reconnect on the client side). */
export function endSocketSession(socket: Socket, reason: AuthEndedReason): void {
  const push: AuthEndedPush = { reason };
  socket.emit('auth:ended', push);
  socket.disconnect(true);
}

/** Wylogowanie: każde gniazdo tej sesji, w każdej karcie, traci połączenie. */
export function endSessionSockets(
  io: SocketIOServer,
  sessionId: string,
  reason: AuthEndedReason,
): void {
  const room = sessionRoom(sessionId);
  const push: AuthEndedPush = { reason };
  io.in(room).emit('auth:ended', push);
  io.in(room).disconnectSockets(true);
}

/** True once the session behind this socket is past its expiry. */
export function socketSessionExpired(socket: Socket, now = Date.now()): boolean {
  const expiresAt = socket.data.sessionExpiresAt;
  return typeof expiresAt === 'number' && now >= expiresAt;
}

/**
 * Rozłącza gniazdo w chwili wygaśnięcia jego sesji — także gniazdo, które nic
 * nie wysyła, a tylko słucha stołu. Zegar sięga najwyżej ~23 dób naprzód
 * i nastawia się od nowa, bo sesja (od 01.10) żyje rok.
 */
export function armSessionExpiry(socket: Socket): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const arm = () => {
    const expiresAt = socket.data.sessionExpiresAt;
    if (typeof expiresAt !== 'number') return;
    const left = expiresAt - Date.now();
    if (left <= 0) {
      endSocketSession(socket, 'expired');
      return;
    }
    timer = setTimeout(arm, Math.min(left, MAX_TIMER_MS));
    timer.unref?.();
  };
  arm();
  socket.on('disconnect', () => {
    if (timer) clearTimeout(timer);
  });
}
