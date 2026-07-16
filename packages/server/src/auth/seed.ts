import type { FastifyBaseLogger } from 'fastify';
import { ROLE_GM } from '@vtt/shared';
import type { ServerConfig } from '../config.js';
import type { PrismaClient } from '../db.js';
import { hashPassword, verifyPassword } from './passwords.js';

/**
 * Bootstraps the GM account from .env: creates it when missing and keeps the
 * password hash in sync with GM_PASSWORD (env is the source of truth).
 */
export async function ensureGmUser(
  prisma: PrismaClient,
  config: ServerConfig,
  log: FastifyBaseLogger,
): Promise<void> {
  const gm = await prisma.user.findFirst({ where: { role: ROLE_GM } });

  if (!config.gmPassword) {
    if (!gm) {
      log.warn('GM_PASSWORD is not set and no GM account exists — GM login is impossible');
    }
    return;
  }

  if (!gm) {
    await prisma.user.create({
      data: {
        name: config.gmName,
        role: ROLE_GM,
        passwordHash: await hashPassword(config.gmPassword),
      },
    });
    log.info('GM account created from GM_PASSWORD');
    return;
  }

  const upToDate = gm.passwordHash && (await verifyPassword(gm.passwordHash, config.gmPassword));
  if (!upToDate) {
    await prisma.user.update({
      where: { id: gm.id },
      data: { passwordHash: await hashPassword(config.gmPassword) },
    });
    log.info('GM password updated from GM_PASSWORD');
  }
}
