import type { FastifyBaseLogger } from 'fastify';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { Role, SessionUser, SocketAck } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { Prisma } from '../generated/prisma/client.js';
import type { RoomSequences } from './state.js';
import type { SocketRateLimiter } from '../rate-limit.js';
import { withPresentation } from './presentation.js';
import { endSocketSession, socketSessionExpired } from './session-guard.js';
import { BETWEEN_SESSIONS_EVENTS, type SessionClock } from './session-clock.js';

/** Shared dependencies passed to every realtime event handler. */
export interface RealtimeDeps {
  io: SocketIOServer;
  log: FastifyBaseLogger;
  ctx: AppContext;
  seqs: RoomSequences;
  presentation?: (() => Promise<void> | void)[];
  /** Limit tempa zdarzeń per konto (#13); brak = bez limitu (`config.rateLimits`). */
  rateLimiter?: SocketRateLimiter;
  /** Liczniki trwających sesji i ich progi (etap 44c, `realtime/sessions.ts`). */
  sessions: SessionClock;
}

/** Thrown by handlers to reject an event with a machine-readable code. */
export class RealtimeError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'RealtimeError';
  }
}

export interface EventArgs<TPayload> {
  deps: RealtimeDeps;
  socket: Socket;
  user: SessionUser;
  payload: TPayload;
}

/**
 * A realtime event definition: name, required role and handler. The registry
 * takes care of the role guard, ack plumbing and error mapping, so handlers
 * only implement: validate → mutate → broadcast.
 */
export interface RealtimeEvent<TPayload = unknown, TResult = unknown> {
  name: string;
  /** Role required to invoke the event; omit to allow any authenticated user. */
  role?: Role;
  /**
   * Tylko konto właściciela serwera (etap 44a) — kopie całej bazy. Stoi obok
   * `role: ROLE_GM`, nie zamiast niej: macierz ról E2E czyta samą rolę.
   */
  ownerOnly?: boolean;
  handler: (args: EventArgs<TPayload>) => Promise<TResult> | TResult;
}

/** Preserve event types and publish roll messages before result-dependent views. */
export function defineEvent<TPayload = unknown, TResult = void>(
  event: RealtimeEvent<TPayload, TResult>,
): RealtimeEvent<TPayload, TResult> {
  return {
    ...event,
    handler: (args) => withPresentation(args.deps, (deps) => event.handler({ ...args, deps })),
  };
}

/**
 * Wires event definitions to a connected socket. The last argument of an
 * emit, when it is a function, is treated as the acknowledgement callback;
 * the first argument is the payload.
 */
export function registerEvents(
  deps: RealtimeDeps,
  socket: Socket,
  events: RealtimeEvent<never, unknown>[],
): void {
  for (const event of events) {
    socket.on(event.name, (...args: unknown[]) => {
      const maybeAck = args.at(-1);
      const ack =
        typeof maybeAck === 'function'
          ? (maybeAck as (response: SocketAck<unknown>) => void)
          : undefined;
      // A fire-and-forget emit carries the payload as its only argument, so
      // „first argument is also the last one" must not be read as „the payload
      // is the callback". Only an actual callback is allowed to shadow it —
      // otherwise every ack-less event (intermediate `token:move`, rulers)
      // would reach its handler with nothing in its hands.
      const payload = ack && args.length === 1 ? undefined : args[0];

      const user = socket.data.user;
      // #11: zdarzenie, które zdążyło przed zegarem wygaśnięcia, też dostaje odmowę.
      if (socketSessionExpired(socket)) {
        ack?.({ ok: false, error: 'SESSION_ENDED' });
        endSocketSession(socket, 'expired');
        return;
      }
      // #13: limit per konto, przed rolą i przed bazą — odmowa nic nie kosztuje.
      // Zdarzenie bez potwierdzenia (klatka przeciągania, miarka) przepada po
      // cichu: następna i tak zaraz przyjdzie, a odpowiedzieć nie ma komu.
      if (deps.rateLimiter && !deps.rateLimiter.allow(user.id, ack ? 'acked' : 'fireAndForget')) {
        ack?.({ ok: false, error: 'RATE_LIMITED' });
        return;
      }
      if ((event.role && user.role !== event.role) || (event.ownerOnly && !user.owner)) {
        ack?.({ ok: false, error: 'FORBIDDEN' });
        return;
      }
      // Etap 44c: gracz między sesjami nie siedzi przy stole — wolno mu tylko
      // to, co stoi na białej liście (karta, dziennik, handouty, czytanie
      // czatu). Odmowa przed bazą, także dla zdarzenia wysłanego z konsoli.
      if (
        socket.data.campaign &&
        socket.data.atTable !== true &&
        !BETWEEN_SESSIONS_EVENTS.has(event.name)
      ) {
        ack?.({ ok: false, error: 'SESSION_NOT_RUNNING' });
        return;
      }

      void (async () => {
        try {
          const result = await event.handler({ deps, socket, user, payload: payload as never });
          // Zegar bezczynności (44c) liczy zdarzenia gry przy stole.
          const campaignId = (socket.data.campaign as { id: string } | null | undefined)?.id;
          if (campaignId && socket.data.atTable === true)
            deps.sessions.touch(campaignId, event.name);
          ack?.(result === undefined ? { ok: true } : { ok: true, data: result });
        } catch (error) {
          if (error instanceof RealtimeError) {
            ack?.({ ok: false, error: error.code });
          } else if (error instanceof Prisma.PrismaClientValidationError) {
            // Ładunek, którego zapytanie nie przyjęło — id spoza zakresu Int
            // (`1e308`), ułamek, zły typ (#15, 26.09). To odmowa, nie awaria:
            // stan jest nietknięty, a „INTERNAL” w logu zasłaniałby prawdziwe
            // awarie. Zostaje ślad w logu, na wypadek gdyby zły typ podał serwer.
            deps.log.warn({ err: error, event: event.name }, 'realtime payload rejected by query');
            ack?.({ ok: false, error: 'BAD_REQUEST' });
          } else {
            deps.log.error({ err: error, event: event.name }, 'realtime handler failed');
            ack?.({ ok: false, error: 'INTERNAL' });
          }
        }
      })();
    });
  }
}
