import { createHash, randomBytes } from 'node:crypto';
import type { PasswordResetLink } from '@vtt/shared';
import type { PrismaClient } from '../db.js';

/** Link ustawienia hasła żyje dobę (decyzja MG z 03.10). */
export const PASSWORD_RESET_TTL_MS = 24 * 60 * 60 * 1000;

/** W bazie leży tylko skrót — kopia bazy nie niesie działających linków. */
export function resetTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Nowy link dla konta (etap 44a). Wcześniejsze niewykorzystane linki tego konta
 * przestają działać — w obiegu jest zawsze najwyżej jeden.
 */
export async function createPasswordReset(
  prisma: PrismaClient,
  userId: string,
  now = Date.now(),
): Promise<PasswordResetLink> {
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(now + PASSWORD_RESET_TTL_MS);
  await prisma.$transaction([
    prisma.passwordReset.deleteMany({ where: { userId, usedAt: null } }),
    prisma.passwordReset.create({
      data: { tokenHash: resetTokenHash(token), userId, expiresAt },
    }),
  ]);
  return { token, expiresAt: expiresAt.toISOString() };
}

/** Ważny (nieużyty, niewygasły) link razem z kontem — inaczej null. */
export async function findValidPasswordReset(prisma: PrismaClient, token: string) {
  if (token.length === 0 || token.length > 128) return null;
  const reset = await prisma.passwordReset.findUnique({
    where: { tokenHash: resetTokenHash(token) },
    include: { user: true },
  });
  if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) return null;
  return reset;
}

/**
 * Zużywa link — atomowo, więc dwa równoległe wysłania formularza nie ustawią
 * hasła dwa razy. Zwraca false, gdy ktoś był szybszy.
 */
export async function consumePasswordReset(prisma: PrismaClient, id: string): Promise<boolean> {
  const { count } = await prisma.passwordReset.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1;
}
