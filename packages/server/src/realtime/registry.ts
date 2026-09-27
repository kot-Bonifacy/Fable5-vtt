import type { FastifyBaseLogger } from 'fastify';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { Role, SessionUser, SocketAck } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { Prisma } from '../generated/prisma/client.js';
import type { RoomSequences } from './state.js';
import { withPresentation } from './presentation.js';

/** Shared dependencies passed to every realtime event handler. */
export interface RealtimeDeps {
  io: SocketIOServer;
  log: FastifyBaseLogger;
  ctx: AppContext;
  seqs: RoomSequences;
  presentation?: (() => Promise<void> | void)[];
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
      if (event.role && user.role !== event.role) {
        ack?.({ ok: false, error: 'FORBIDDEN' });
        return;
      }

      void (async () => {
        try {
          const result = await event.handler({ deps, socket, user, payload: payload as never });
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
