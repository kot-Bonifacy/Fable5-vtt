import type { Role, SessionUser } from '@vtt/shared';
import { DEFAULT_DICE_SKIN, isDiceSkinId } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { User } from '../generated/prisma/client.js';

export const SESSION_COOKIE = 'vtt_sid';

const DAY_MS = 24 * 60 * 60 * 1000;

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    name: user.name,
    role: user.role as Role,
    // A skin the client does not know about (downgraded build, hand-edited
    // row) falls back to the default rather than breaking the session.
    diceSkin: isDiceSkinId(user.diceSkin) ? user.diceSkin : DEFAULT_DICE_SKIN,
  };
}

export async function createSession(prisma: PrismaClient, userId: string, ttlDays: number) {
  return prisma.session.create({
    data: { userId, expiresAt: new Date(Date.now() + ttlDays * DAY_MS) },
  });
}

/** A valid session: its user and the moment it stops being valid. */
export interface ResolvedSession {
  user: SessionUser;
  expiresAt: Date;
}

/** Returns a valid, unexpired session — otherwise null (an expired row is removed). */
export async function resolveSession(
  prisma: PrismaClient,
  sessionId: string,
): Promise<ResolvedSession | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { id: sessionId } });
    return null;
  }
  return { user: toSessionUser(session.user), expiresAt: session.expiresAt };
}

/** Returns the user for a valid, unexpired session — otherwise null. */
export async function resolveSessionUser(
  prisma: PrismaClient,
  sessionId: string,
): Promise<SessionUser | null> {
  return (await resolveSession(prisma, sessionId))?.user ?? null;
}

export async function deleteSession(prisma: PrismaClient, sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}
