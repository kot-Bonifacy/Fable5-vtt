import type { FastifyBaseLogger } from 'fastify';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { Role, SessionUser, SocketAck } from '@vtt/shared';
import type { AppContext } from '../context.js';
import type { RoomSequences } from './state.js';

/** Shared dependencies passed to every realtime event handler. */
export interface RealtimeDeps {
  io: SocketIOServer;
  log: FastifyBaseLogger;
  ctx: AppContext;
  seqs: RoomSequences;
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

/** Identity helper that preserves payload/result types of an event definition. */
export function defineEvent<TPayload = unknown, TResult = void>(
  event: RealtimeEvent<TPayload, TResult>,
): RealtimeEvent<TPayload, TResult> {
  return event;
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
      const payload = args[0] === maybeAck ? undefined : args[0];

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
          } else {
            deps.log.error({ err: error, event: event.name }, 'realtime handler failed');
            ack?.({ ok: false, error: 'INTERNAL' });
          }
        }
      })();
    });
  }
}
