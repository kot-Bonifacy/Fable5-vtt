import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type {
  AdminDeleteAccountResult,
  AdminRunningSession,
  AdminSessionRecord,
  AdminSessionsView,
  AdminSettingsView,
  GmAccountView,
  SessionEndReason,
  SessionUser,
} from '@vtt/shared';
import {
  ADMIN_SESSION_HISTORY_LIMIT,
  ROLE_GM,
  ROLE_PLAYER,
  gmPasswordError,
  isAiAccessStatus,
} from '@vtt/shared';
import type { AppContext } from '../context.js';
import type { User } from '../generated/prisma/client.js';
import { requireAdmin } from '../auth/guards.js';
import { hashPassword } from '../auth/passwords.js';
import { createPasswordReset } from '../auth/password-reset.js';
import { endUserSessions } from '../auth/sessions.js';
import { notifyAdmins } from '../realtime/admin-room.js';
import { campaignRoom } from '../realtime/state.js';
import { endSession } from '../realtime/sessions.js';
import type { RealtimeDeps } from '../realtime/registry.js';
import { registrationOpen, setRegistrationOpen } from '../server-settings.js';
import { snapshotListView, snapshotPathsFor, takeSnapshotAndRotate } from '../snapshots.js';

/**
 * Panel administratora (etap 53; do 53 — panel właściciela z 44a na koncie MG).
 *
 * Konto `ADMIN` nie siada przy stole, tylko prowadzi serwer: konta MG (hasło
 * tymczasowe, link resetu, blokada, usunięcie), trwające sesje i ich dziennik,
 * rejestracja i kopie całej bazy. AI właściciela ma swoje trasy obok
 * (`routes/ai-access.ts`, `/api/admin/ai…`). Konto MG właściciela z `.env`
 * stoi na liście, ale panel go nie zmienia — hasło bierze się z `.env`,
 * a kampanie tego konta mają AI zawsze.
 */
export function registerAdminRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: RealtimeDeps,
): void {
  const adminOnly = { preHandler: requireAdmin };
  const io = deps.io;

  /* --------------------------- konta MG --------------------------- */

  app.get('/api/admin/accounts', adminOnly, async () => {
    const users = await ctx.prisma.user.findMany({
      where: { role: ROLE_GM },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { campaignsRun: true } },
        campaignsRun: { where: { sessionStartedAt: { not: null } }, select: { id: true } },
      },
    });
    const accounts: GmAccountView[] = users.map((user) => ({
      id: user.id,
      login: user.login ?? user.name,
      owner: user.owner,
      blocked: user.blockedAt !== null,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      campaigns: user._count.campaignsRun,
      ai: isAiAccessStatus(user.aiAccess) ? user.aiAccess : 'none',
      temporaryPassword: user.mustChangePassword,
      sessionRunning: user.campaignsRun.length > 0,
    }));
    return accounts;
  });

  /** Konto MG, które administrator może ruszyć — albo kod odmowy. */
  async function managedAccount(
    id: string,
  ): Promise<{ user: User } | { error: string; status: number }> {
    const user = await ctx.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== ROLE_GM) return { error: 'NOT_FOUND', status: 404 };
    // Hasło z `.env`, kampanie z AI zawsze — tego konta panel nie dotyka.
    if (user.owner) return { error: 'OWNER_ACCOUNT', status: 409 };
    return { user };
  }

  /** Jednorazowy link ustawienia hasła, ważny dobę — administrator przekazuje go poza VTT. */
  app.post('/api/admin/accounts/:id/reset', adminOnly, async (request, reply) => {
    const { id } = request.params as { id: string };
    const found = await managedAccount(id);
    if ('error' in found) return reply.code(found.status).send({ error: found.error });
    return reply.code(201).send(await createPasswordReset(ctx.prisma, found.user.id));
  });

  /**
   * Hasło tymczasowe (decyzja MG z 17.10): administrator wpisuje hasło, MG
   * loguje się nim i od razu musi ustawić własne. Wszystkie sesje konta się
   * kończą, a czekający link resetu przestaje działać — w obiegu jest jedna
   * droga do konta.
   */
  app.post('/api/admin/accounts/:id/password', adminOnly, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { password } = (request.body ?? {}) as { password?: unknown };
    if (typeof password !== 'string') return reply.code(400).send({ error: 'BAD_REQUEST' });
    const found = await managedAccount(id);
    if ('error' in found) return reply.code(found.status).send({ error: found.error });
    const invalid = gmPasswordError(password, password, found.user.login);
    if (invalid) return reply.code(400).send({ error: invalid });

    await ctx.prisma.$transaction([
      ctx.prisma.user.update({
        where: { id: found.user.id },
        data: { passwordHash: await hashPassword(password), mustChangePassword: true },
      }),
      ctx.prisma.passwordReset.deleteMany({ where: { userId: found.user.id, usedAt: null } }),
    ]);
    await endUserSessions(ctx.prisma, io, found.user.id, 'password');
    request.log.info({ userId: found.user.id }, 'temporary GM password set by the admin');
    notifyAdmins(io);
    return { ok: true };
  });

  /**
   * „Zablokuj” / „Odblokuj” (decyzja MG z 03.10). Blokada kończy każdą sesję
   * konta i odmawia logowania; kampanie zostają w bazie nietknięte.
   */
  app.post('/api/admin/accounts/:id/block', adminOnly, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { blocked } = (request.body ?? {}) as { blocked?: unknown };
    if (typeof blocked !== 'boolean') return reply.code(400).send({ error: 'BAD_REQUEST' });
    const found = await managedAccount(id);
    if ('error' in found) return reply.code(found.status).send({ error: found.error });

    await ctx.prisma.user.update({
      where: { id: found.user.id },
      data: { blockedAt: blocked ? (found.user.blockedAt ?? new Date()) : null },
    });
    if (blocked) await endUserSessions(ctx.prisma, io, found.user.id, 'blocked');
    // Zablokowany MG traci też zgodę na AI właściciela (44d) — od razu.
    await ctx.ai.refresh();
    request.log.info({ userId: found.user.id, blocked }, 'GM account block changed');
    notifyAdmins(io);
    return { ok: true };
  });

  /**
   * Usunięcie konta MG (decyzja MG z 17.10): konto, jego kampanie z całą
   * treścią i plikami oraz konta graczy, które należały wyłącznie do nich.
   * Potwierdzeniem jest login przepisany ręką. Trwająca sesja kończy się
   * najpierw zwykłą drogą (gracze dostają „Między sesjami”, wpis w dzienniku
   * z powodem `deleted`), dopiero potem znika kampania. Dziennik sesji zostaje.
   */
  app.delete('/api/admin/accounts/:id', adminOnly, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { confirm } = (request.body ?? {}) as { confirm?: unknown };
    if (typeof confirm !== 'string') return reply.code(400).send({ error: 'BAD_REQUEST' });
    const found = await managedAccount(id);
    if ('error' in found) return reply.code(found.status).send({ error: found.error });
    const login = found.user.login ?? found.user.name;
    if (confirm.trim().toLowerCase() !== login.toLowerCase()) {
      return reply.code(400).send({ error: 'CONFIRM_MISMATCH' });
    }

    const campaigns = await ctx.prisma.campaign.findMany({
      where: { gmId: found.user.id },
      select: { id: true, sessionStartedAt: true },
    });
    const campaignIds = campaigns.map((campaign) => campaign.id);
    for (const campaign of campaigns) {
      if (campaign.sessionStartedAt) await endSession(deps, campaign.id, 'deleted');
    }
    // Gracz należy do jednej kampanii (44b), ale strzeżonego nie kasuje się
    // z cudzej: tylko konta bez członkostwa poza usuwanymi kampaniami.
    const players = await ctx.prisma.user.findMany({
      where: {
        role: ROLE_PLAYER,
        AND: [
          { memberships: { some: { campaignId: { in: campaignIds } } } },
          { memberships: { none: { campaignId: { notIn: campaignIds } } } },
        ],
      },
      select: { id: true },
    });
    const playerIds = players.map((player) => player.id);

    // Gniazda najpierw — nikt nie pisze do kampanii, która za chwilę zniknie.
    for (const userId of [found.user.id, ...playerIds]) {
      await endUserSessions(ctx.prisma, io, userId, 'deleted');
    }
    await ctx.prisma.$transaction([
      ctx.prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } }),
      ctx.prisma.user.deleteMany({ where: { id: { in: playerIds } } }),
      ctx.prisma.user.delete({ where: { id: found.user.id } }),
    ]);
    for (const campaignId of campaignIds) {
      await rm(join(ctx.config.uploadsDir, 'campaigns', campaignId), {
        recursive: true,
        force: true,
      }).catch((error: unknown) => {
        request.log.warn({ err: error, campaignId }, 'campaign uploads not removed');
      });
    }
    await ctx.ai.refresh();
    request.log.warn(
      { userId: found.user.id, login, campaigns: campaignIds.length, players: playerIds.length },
      'GM account deleted by the admin',
    );
    notifyAdmins(io);
    const result: AdminDeleteAccountResult = {
      campaigns: campaignIds.length,
      players: playerIds.length,
    };
    return result;
  });

  /* ---------------------------- sesje ----------------------------- */

  /** Gracze, których gniazda siedzą teraz przy stole tej kampanii. */
  async function playersAtTable(campaignId: string): Promise<string[]> {
    const names = new Set<string>();
    for (const socket of await io.in(campaignRoom(campaignId)).fetchSockets()) {
      const user = socket.data.user as SessionUser | undefined;
      if (user?.role === ROLE_PLAYER) names.add(user.name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'pl'));
  }

  app.get('/api/admin/sessions', adminOnly, async () => {
    const holder = ctx.ai.leaseHolder()?.id ?? null;
    const runningRows = await ctx.prisma.campaign.findMany({
      where: { sessionStartedAt: { not: null } },
      orderBy: { sessionStartedAt: 'asc' },
      select: {
        id: true,
        name: true,
        sessionStartedAt: true,
        gm: { select: { login: true, name: true } },
      },
    });
    const running: AdminRunningSession[] = [];
    for (const row of runningRows) {
      running.push({
        campaignId: row.id,
        campaignName: row.name,
        gmLogin: row.gm?.login ?? row.gm?.name ?? '—',
        startedAt: row.sessionStartedAt!.toISOString(),
        atTable: await playersAtTable(row.id),
        aiHolder: holder === row.id,
      });
    }
    const historyRows = await ctx.prisma.gameSession.findMany({
      orderBy: { startedAt: 'desc' },
      take: ADMIN_SESSION_HISTORY_LIMIT,
      include: { players: { orderBy: { firstSeenAt: 'asc' }, select: { name: true } } },
    });
    const history: AdminSessionRecord[] = historyRows.map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      gmLogin: row.gmLogin,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      endReason: (row.endReason as SessionEndReason | null) ?? null,
      players: row.players.map((player) => player.name),
    }));
    const view: AdminSessionsView = {
      running,
      history,
      maxSessions: ctx.config.sessions?.maxSessions ?? 0,
    };
    return view;
  });

  /** „Zakończ sesję” administratora — porzucona albo zawieszona sesja zwalnia slot. */
  app.post('/api/admin/sessions/:campaignId/end', adminOnly, async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    if (!(await endSession(deps, campaignId, 'admin'))) {
      return reply.code(409).send({ error: 'SESSION_NOT_RUNNING' });
    }
    request.log.info({ campaignId }, 'session ended by the admin');
    return { ok: true };
  });

  /* ------------------------- ustawienia --------------------------- */

  app.get('/api/admin/settings', adminOnly, async () => {
    const view: AdminSettingsView = { registration: await registrationOpen(ctx) };
    return view;
  });

  app.post('/api/admin/settings', adminOnly, async (request, reply) => {
    const { registration } = (request.body ?? {}) as { registration?: unknown };
    if (typeof registration !== 'boolean') return reply.code(400).send({ error: 'BAD_REQUEST' });
    await setRegistrationOpen(ctx, registration);
    request.log.info({ registration }, 'registration switched by the admin');
    const view: AdminSettingsView = { registration: await registrationOpen(ctx) };
    return view;
  });

  /* --------------------- kopie całej bazy ------------------------- */

  /** Kopie całej bazy niosą kampanie wszystkich MG — tylko administrator (44a, od 53 admin). */
  app.get('/api/admin/backups', adminOnly, async () => snapshotListView(ctx.config));

  /**
   * „Zrób kopię teraz". Rotacja idzie razem z kopią — nigdy nie robi się
   * jednego bez drugiego, bo katalog bez rotacji rośnie po cichu.
   */
  app.post('/api/admin/backups', adminOnly, async (_request, reply) => {
    const paths = snapshotPathsFor(ctx.config);
    const backups = ctx.config.backups;
    if (!paths || !backups) return reply.code(409).send({ error: 'BACKUP_DISABLED' });
    await takeSnapshotAndRotate(
      paths,
      { keepHourly: backups.keepHourly, keepDaily: backups.keepDaily },
      'gm',
    );
    return snapshotListView(ctx.config);
  });
}
