import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { Role, SessionUser, SocketAck } from '@vtt/shared';
import { ROLE_GM, createServerHello } from '@vtt/shared';
import type { AppContext } from './context.js';
import { SESSION_COOKIE, resolveSessionUser } from './auth/sessions.js';

declare module 'socket.io' {
  interface SocketData {
    user: SessionUser;
  }
}

/**
 * Wraps a socket event handler so it only runs for the given role; otherwise
 * the acknowledgement (when provided) receives a FORBIDDEN error.
 */
export function withRole(
  socket: Socket,
  role: Role,
  handler: (...args: unknown[]) => void,
): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    const maybeAck = args.at(-1);
    const ack = typeof maybeAck === 'function' ? (maybeAck as (response: SocketAck) => void) : undefined;
    if (socket.data.user.role !== role) {
      ack?.({ ok: false, error: 'FORBIDDEN' });
      return;
    }
    handler(...args);
  };
}

async function authenticateHandshake(
  app: FastifyInstance,
  ctx: AppContext,
  cookieHeader: string | undefined,
): Promise<SessionUser | null> {
  if (!cookieHeader) return null;
  const cookies = app.parseCookie(cookieHeader);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = app.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  return resolveSessionUser(ctx.prisma, unsigned.value);
}

export function setupSockets(io: SocketIOServer, app: FastifyInstance, ctx: AppContext): void {
  io.use((socket, next) => {
    authenticateHandshake(app, ctx, socket.handshake.headers.cookie)
      .then((user) => {
        if (!user) {
          next(new Error('UNAUTHORIZED'));
          return;
        }
        socket.data.user = user;
        next();
      })
      .catch(() => next(new Error('UNAUTHORIZED')));
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    app.log.info({ socketId: socket.id, userId: user.id, role: user.role }, 'socket connected');

    socket.emit('server:hello', createServerHello());

    // Placeholder GM-only event: establishes the role-guard pattern (and is
    // covered by tests) until real GM actions arrive in stages 04+.
    socket.on(
      'gm:ping',
      withRole(socket, ROLE_GM, (...args) => {
        const ack = args.at(-1);
        if (typeof ack === 'function') (ack as (response: SocketAck) => void)({ ok: true });
      }),
    );

    socket.on('disconnect', (reason) => {
      app.log.info({ socketId: socket.id, reason }, 'socket disconnected');
    });
  });
}
