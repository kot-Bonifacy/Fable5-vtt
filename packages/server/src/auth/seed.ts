import type { FastifyBaseLogger } from 'fastify';
import { ROLE_GM, normalizeGmLogin } from '@vtt/shared';
import type { ServerConfig } from '../config.js';
import type { PrismaClient } from '../db.js';
import { hashPassword, verifyPassword } from './passwords.js';

/**
 * Bootstraps the owner's GM account from .env: creates it when missing, keeps
 * the password hash in sync with GM_PASSWORD (env is the source of truth) and
 * makes sure it carries the owner flag and no block.
 *
 * Since stage 44a the account is found by its login (`GM_NAME`, case-folded),
 * not as „the first GM" — other GMs register accounts of their own. The 44a
 * migration gave the one GM account that existed before `login = lower(name)`,
 * so an existing installation finds its old account here.
 */
export async function ensureGmUser(
  prisma: PrismaClient,
  config: ServerConfig,
  log: FastifyBaseLogger,
): Promise<void> {
  const login = normalizeGmLogin(config.gmName);
  const gm = await prisma.user.findUnique({ where: { login } });

  if (!config.gmPassword) {
    if (!gm) {
      log.warn('GM_PASSWORD is not set and no owner account exists — owner login is impossible');
    }
    return;
  }

  if (!gm) {
    await prisma.user.create({
      data: {
        name: config.gmName,
        login,
        role: ROLE_GM,
        owner: true,
        passwordHash: await hashPassword(config.gmPassword),
      },
    });
    log.info('owner account created from GM_NAME / GM_PASSWORD');
    return;
  }

  if (gm.role !== ROLE_GM || !gm.owner || gm.blockedAt) {
    await prisma.user.update({
      where: { id: gm.id },
      data: { role: ROLE_GM, owner: true, blockedAt: null },
    });
    log.info('owner flag restored on the GM_NAME account');
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
