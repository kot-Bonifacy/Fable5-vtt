import type { FastifyBaseLogger } from 'fastify';
import { ROLE_ADMIN, ROLE_GM, normalizeGmLogin } from '@vtt/shared';
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

/**
 * Konto administratora z `.env` (etap 53): `VTT_ADMIN_LOGIN` i
 * `VTT_ADMIN_PASSWORD`. Inaczej niż konto właściciela **hasło służy tylko do
 * założenia konta** — jest tymczasowe (`mustChangePassword`), a raz zmienione
 * w panelu zostaje, choćby `.env` dalej trzymał stare. Istniejące konto
 * dostaje z powrotem rolę, flagę właściciela (AI i obecność) i zdjętą blokadę;
 * login zajęty przez konto MG albo gracza zostaje nietknięty — przejęcie
 * cudzego konta zmianą `.env` byłoby furtką.
 */
export async function ensureAdminUser(
  prisma: PrismaClient,
  config: ServerConfig,
  log: FastifyBaseLogger,
): Promise<void> {
  if (!config.adminLogin) return;
  const login = normalizeGmLogin(config.adminLogin);
  if (login === normalizeGmLogin(config.gmName)) {
    log.warn('VTT_ADMIN_LOGIN equals GM_NAME — the admin account needs a login of its own');
    return;
  }
  const admin = await prisma.user.findUnique({ where: { login } });

  if (!admin) {
    if (!config.adminPassword) {
      log.warn('VTT_ADMIN_PASSWORD is not set — the admin account cannot be created');
      return;
    }
    await prisma.user.create({
      data: {
        name: login,
        login,
        role: ROLE_ADMIN,
        owner: true,
        mustChangePassword: true,
        passwordHash: await hashPassword(config.adminPassword),
      },
    });
    log.info('admin account created from VTT_ADMIN_LOGIN (temporary password)');
    return;
  }

  if (admin.role !== ROLE_ADMIN) {
    log.warn({ login }, 'VTT_ADMIN_LOGIN is taken by a GM or player account — admin not created');
    return;
  }
  if (!admin.owner || admin.blockedAt) {
    await prisma.user.update({ where: { id: admin.id }, data: { owner: true, blockedAt: null } });
    log.info('owner flag restored on the admin account');
  }
  if (config.adminPasswordReset && config.adminPassword) {
    // Idempotentnie: hasło już tymczasowe i zgodne z `.env` zostaje, jak jest —
    // każdy nowy skrót (nowa sól) zmieniałby bazę przy każdym restarcie.
    const alreadyReset =
      admin.mustChangePassword &&
      admin.passwordHash !== null &&
      (await verifyPassword(admin.passwordHash, config.adminPassword));
    if (alreadyReset) return;
    await prisma.user.update({
      where: { id: admin.id },
      data: { passwordHash: await hashPassword(config.adminPassword), mustChangePassword: true },
    });
    await prisma.session.deleteMany({ where: { userId: admin.id } });
    log.warn(
      'VTT_ADMIN_RESET_PASSWORD: admin password reset to VTT_ADMIN_PASSWORD — remove the flag',
    );
  }
}
