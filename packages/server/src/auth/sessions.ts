import type { Role, SessionUser } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { User } from '../generated/prisma/client.js';

export const SESSION_COOKIE = 'vtt_sid';

const DAY_MS = 24 * 60 * 60 * 1000;

export function toSessionUser(user: User): SessionUser {
  return { id: user.id, name: user.name, role: user.role as Role };
}

export async function createSession(prisma: PrismaClient, userId: string, ttlDays: number) {
  return prisma.session.create({
    data: { userId, expiresAt: new Date(Date.now() + ttlDays * DAY_MS) },
  });
}

/** Returns the user for a valid, unexpired session — otherwise null. */
export async function resolveSessionUser(
  prisma: PrismaClient,
  sessionId: string,
): Promise<SessionUser | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { id: sessionId } });
    return null;
  }
  return toSessionUser(session.user);
}

export async function deleteSession(prisma: PrismaClient, sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}
