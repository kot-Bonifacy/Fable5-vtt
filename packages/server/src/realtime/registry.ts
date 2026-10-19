import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import {
  GM_OVER_BUDGET,
  ROLE_GM,
  type CombatOverspendAsk,
  type Role,
  type SessionUser,
  type SocketAck,
} from '@vtt/shared';
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

/**
 * Wydatek MG poza budżetem tury, zatrzymany do potwierdzenia (19.10.2026).
 * Rzuca go `applySpend` (`combat.ts`); rejestr zapamiętuje zdarzenie, które
 * go wywołało, i pyta MG paskiem (`combat:overspend-ask`).
 */
export class OverspendAsk extends RealtimeError {
  constructor(public readonly ask: Omit<CombatOverspendAsk, 'askId'>) {
    super(GM_OVER_BUDGET);
  }
}

/**
 * Konto MG obsługiwanego teraz zdarzenia z gniazda. Pyta się tylko jego: bot
 * gra kontem MG, ale z własnym obiektem użytkownika (`botActorUser`), więc
 * porównanie tożsamości go pomija — bot nie ma komu pokazać pytania.
 */
const overspendAsker = new AsyncLocalStorage<SessionUser>();

/** Czy wydatek MG poza budżetem ma najpierw zapytać (zamiast przejść po cichu). */
export function asksBeforeOverspend(user: SessionUser): boolean {
  return overspendAsker.getStore() === user;
}

/** Pytanie żyje tyle, ile MG rozsądnie się namyśla; po tym runda mogła się zmienić. */
const OVERSPEND_ASK_TTL_MS = 2 * 60_000;

interface PendingOverspend {
  askId: string;
  at: number;
  /** Powtórka zdarzenia już poza `overspendAsker` — wydatek przejdzie jak dawniej. */
  replay: () => Promise<unknown>;
}

/** Jedno pytanie na gniazdo: nowe zastępuje stare (pasek u klienta też). */
const pendingOverspend = new WeakMap<Socket, PendingOverspend>();

/** Zabiera zapamiętaną intencję do powtórki; `null`, gdy pytanie wygasło albo zastąpiono je. */
export function takeOverspendReplay(
  socket: Socket,
  askId: unknown,
): (() => Promise<unknown>) | null {
  const pending = pendingOverspend.get(socket);
  if (!pending || pending.askId !== askId) return null;
  pendingOverspend.delete(socket);
  if (Date.now() - pending.at > OVERSPEND_ASK_TTL_MS) return null;
  return pending.replay;
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
        const run = () => event.handler({ deps, socket, user, payload: payload as never });
        try {
          const result = await (user.role === ROLE_GM ? overspendAsker.run(user, run) : run());
          // Zegar bezczynności (44c) liczy zdarzenia gry przy stole.
          const campaignId = (socket.data.campaign as { id: string } | null | undefined)?.id;
          if (campaignId && socket.data.atTable === true)
            deps.sessions.touch(campaignId, event.name);
          ack?.(result === undefined ? { ok: true } : { ok: true, data: result });
        } catch (error) {
          if (error instanceof OverspendAsk) {
            const askId = randomUUID();
            pendingOverspend.set(socket, {
              askId,
              at: Date.now(),
              replay: async () => overspendAsker.exit(run),
            });
            socket.emit('combat:overspend-ask', {
              ...error.ask,
              askId,
            } satisfies CombatOverspendAsk);
            ack?.({ ok: false, error: error.code });
          } else if (error instanceof RealtimeError) {
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
