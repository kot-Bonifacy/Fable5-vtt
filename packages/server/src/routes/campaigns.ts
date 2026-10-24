import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type {
  CampaignDeleteResult,
  CampaignDetail,
  ChatRecolorPush,
  CpredDataPayload,
} from '@vtt/shared';
import {
  GAME_TIME_DEFAULT,
  INVITATION_TTL_HOURS,
  ROLE_PLAYER,
  confirmsCampaignName,
  gameMonthKey,
  isPlayerColor,
  playerColors,
} from '@vtt/shared';
import type { AppContext } from '../context.js';
import { requireAuth, requireGm } from '../auth/guards.js';
import { endUserSessions } from '../auth/sessions.js';
import { notifyAdmins } from '../realtime/admin-room.js';
import type { RealtimeDeps } from '../realtime/registry.js';
import { campaignRoom, lobbyRoom } from '../realtime/state.js';
import { playerNameTaken, sanitizePlayerName, toInvitationSummary } from '../invitations.js';
import {
  getUserActiveCampaign,
  ownCampaign as ownCampaignOf,
  toCampaignSummary,
} from './helpers.js';

const HOUR_MS = 60 * 60 * 1000;
const MAX_CAMPAIGN_NAME_LENGTH = 64;

/**
 * Ważność nieużytego linku: domyślnie bez terminu (decyzja MG z 24.10 — gracze
 * wchodzą tylko linkami), wywołujący może ją jawnie skrócić (testy).
 */
function invitationExpiry(body: unknown): Date | null {
  const { expiresInHours } = (body ?? {}) as { expiresInHours?: unknown };
  return typeof expiresInHours === 'number' &&
    expiresInHours > 0 &&
    expiresInHours <= INVITATION_TTL_HOURS
    ? new Date(Date.now() + expiresInHours * HOUR_MS)
    : null;
}

const newToken = (): string => randomBytes(24).toString('base64url');

export function registerCampaignRoutes(app: FastifyInstance, ctx: AppContext): void {
  const gmOnly = { preHandler: requireGm };

  /**
   * The cover catalogue (stage 16c) — material × thickness and the presets.
   *
   * Served from the server's own copy rather than as a static file, and that is
   * the whole reason the route exists: `data/private/` **replaces** its public
   * counterpart, the private directory is never served, and a palette reading
   * the public samples would advertise body points the server does not use. One
   * source of the numbers, on the side that decides them.
   */
  app.get('/api/cpred/covers', async () => ctx.covers);

  /**
   * Skills, Roles and the character-creation tables — the same registry the
   * server validates sheets against.
   *
   * Same reason as the covers route above, and the same bug it was written to
   * avoid: until stage 25a the client read `/public/cpred/skills.json` off the
   * static route, so it knew the 42 sample skills while the server knew the 66
   * imported from the rulebook. Twenty-four skills existed on one side of the
   * socket only. Behind `requireAuth`, because the private files are rulebook
   * content and the static route is open to anyone.
   */
  app.get('/api/cpred/data', { preHandler: requireAuth }, async () => {
    const payload: CpredDataPayload = {
      skills: ctx.cpred.skills,
      roles: ctx.cpred.roles,
      creation: ctx.cpred.creation,
      lifepath: ctx.cpred.lifepath,
    };
    return payload;
  });

  const ownCampaign = (id: string, userId: string) => ownCampaignOf(ctx.prisma, id, userId);

  app.get('/api/campaigns', gmOnly, async (request) => {
    // Każdy MG widzi tylko swoje kampanie (etap 44a).
    const open = await getUserActiveCampaign(ctx.prisma, request.user!);
    const campaigns = await ctx.prisma.campaign.findMany({
      where: { OR: [{ gmId: request.user!.id }, { gmId: null }] },
      orderBy: { createdAt: 'desc' },
      include: {
        members: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
        invitations: { orderBy: { createdAt: 'desc' } },
        characters: {
          where: { ownerId: null, pendingOwnerName: { not: null } },
          select: { id: true, name: true, pendingOwnerName: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const detail: CampaignDetail[] = campaigns.map((c) => ({
      ...toCampaignSummary(c),
      open: c.id === open?.id,
      createdAt: c.createdAt.toISOString(),
      players: c.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        joinedAt: m.joinedAt.toISOString(),
        color: isPlayerColor(m.color) ? m.color : null,
      })),
      invitations: c.invitations.map(toInvitationSummary),
      pendingCards: c.characters.map((card) => ({
        id: card.id,
        name: card.name,
        pendingOwner: card.pendingOwnerName ?? '',
      })),
    }));
    return detail;
  });

  app.post('/api/campaigns', gmOnly, async (request, reply) => {
    const gmId = request.user!.id;
    const { name } = (request.body ?? {}) as { name?: unknown };
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed.length === 0 || trimmed.length > MAX_CAMPAIGN_NAME_LENGTH) {
      return reply.code(400).send({ error: 'INVALID_NAME' });
    }

    // Etap 44c: nowa kampania otwiera się u MG do przygotowania — bez slotu.
    // Z trwającą sesją MG zostaje przy niej (przejść wolno dopiero po „Zakończ
    // sesję”), a nowa czeka na liście w Panelu MG.
    const legacy = !ctx.config.sessions;
    const campaign = await ctx.prisma.$transaction(async (tx) => {
      if (legacy) {
        // Testy dymne bez sekcji `sessions`: kampania gra od założenia, a nowa
        // przejmuje stół tego MG, jak przed 44c.
        await tx.campaign.updateMany({
          where: { OR: [{ gmId }, { gmId: null }], sessionStartedAt: { not: null } },
          data: { sessionStartedAt: null, lastSessionEndedAt: new Date() },
        });
      }
      const created = await tx.campaign.create({
        data: {
          name: trimmed,
          gmId,
          ...(legacy ? { sessionStartedAt: new Date() } : {}),
          // Zegar świata rusza od miesiąca, który uznajemy za rozliczony
          // (etap 37): świeży stół nie zaczyna od zaległego czynszu, ale
          // pierwsze przekroczenie granicy miesiąca ma już z czym porównać.
          settledMonth: gameMonthKey(GAME_TIME_DEFAULT),
        },
      });
      const running = await tx.campaign.count({
        where: { gmId, sessionStartedAt: { not: null }, id: { not: created.id } },
      });
      if (running === 0) {
        await tx.user.update({ where: { id: gmId }, data: { openCampaignId: created.id } });
      }
      return created;
    });
    // Brama AI (44d) zna kampanie z pamięci — nowa musi do niej trafić.
    await ctx.ai.refresh();
    return reply.code(201).send(toCampaignSummary(campaign));
  });

  /**
   * „To jest poligon" / „to jest stół" (postulat MG z 22.08).
   *
   * Osobna trasa, a nie pole w tworzeniu kampanii, bo odpowiedź zmienia się
   * w trakcie życia kampanii: „Poligon bojowy" powstał jako zwykły stół i
   * dopiero z czasem stał się miejscem, w którym wolno wszystko. Flaga niczego
   * nie blokuje — o tym, co robi, mówi komentarz przy kolumnie w schemacie.
   */
  app.post('/api/campaigns/:id/sandbox', gmOnly, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sandbox } = (request.body ?? {}) as { sandbox?: unknown };
    if (typeof sandbox !== 'boolean') return reply.code(400).send({ error: 'BAD_REQUEST' });
    const campaign = await ownCampaign(id, request.user!.id);
    if (!campaign) return reply.code(404).send({ error: 'CAMPAIGN_NOT_FOUND' });
    const updated = await ctx.prisma.campaign.update({ where: { id }, data: { sandbox } });
    return toCampaignSummary(updated);
  });

  /**
   * „Nowy gracz” (etap 44b): imienny link, który przy pierwszym użyciu zakłada
   * konto o tym imieniu w tej kampanii i się zużywa.
   */
  app.post('/api/campaigns/:id/invitations', gmOnly, async (request, reply) => {
    const { id } = request.params as { id: string };
    const campaign = await ownCampaign(id, request.user!.id);
    if (!campaign) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    const body = request.body as { name?: unknown; characterId?: unknown } | undefined;
    const name = sanitizePlayerName(body?.name);
    if (name === null) return reply.code(400).send({ error: 'INVALID_NAME' });
    if (await playerNameTaken(ctx.prisma, campaign.id, name)) {
      return reply.code(409).send({ error: 'NAME_TAKEN' });
    }
    // Etap 57a: link może nieść kartę bez gracza — „ta karta jest twoja”.
    let characterId: string | null = null;
    if (body?.characterId !== undefined && body.characterId !== null) {
      const card =
        typeof body.characterId === 'string'
          ? await ctx.prisma.character.findFirst({
              where: { id: body.characterId, campaignId: campaign.id, ownerId: null },
              select: { id: true },
            })
          : null;
      if (!card) return reply.code(404).send({ error: 'CHARACTER_NOT_FOUND' });
      characterId = card.id;
    }

    const invitation = await ctx.prisma.invitation.create({
      data: {
        token: newToken(),
        campaignId: campaign.id,
        name,
        characterId,
        expiresAt: invitationExpiry(request.body),
      },
    });
    return reply.code(201).send(toInvitationSummary(invitation));
  });

  /**
   * „Link odnowienia” (etap 44b): nowy klucz do **tego samego** konta w miejsce
   * zgubionego albo wyciekłego. Od 24.10 linki się nie zużywają, więc wszystkie
   * poprzednie linki tego gracza tracą ważność — klucz do jednego konta jest
   * jeden naraz. Inne urządzenia gracza zostają zalogowane (decyzja MG z 03.10).
   */
  app.post('/api/campaigns/:id/players/:userId/renewal', gmOnly, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    const campaign = await ownCampaign(id, request.user!.id);
    if (!campaign) return reply.code(404).send({ error: 'NOT_FOUND' });
    const member = await ctx.prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: campaign.id, userId } },
      include: { user: true },
    });
    if (!member || member.user.role !== ROLE_PLAYER) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    const invitation = await ctx.prisma.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: { campaignId: campaign.id, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.invitation.create({
        data: {
          token: newToken(),
          campaignId: campaign.id,
          name: member.user.name,
          userId,
          renewal: true,
          expiresAt: invitationExpiry(request.body),
        },
      });
    });
    return reply.code(201).send(toInvitationSummary(invitation));
  });

  app.post('/api/invitations/:id/revoke', gmOnly, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invitation = await ctx.prisma.invitation.findUnique({ where: { id } });
    if (!invitation || !(await ownCampaign(invitation.campaignId, request.user!.id))) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    const revoked = invitation.revokedAt
      ? invitation
      : await ctx.prisma.invitation.update({
          where: { id },
          data: { revokedAt: new Date() },
        });
    return toInvitationSummary(revoked);
  });
}

/**
 * Kolor gracza na czacie (etap 60c): MG wybiera go w „Graczach” — nazwę
 * z palety albo `null` (z powrotem kolor z kolejności dołączenia).
 *
 * Rejestrowana po gniazdach: karty tego gracza już leżą w historii na
 * ekranach, więc stół dostaje `chat:recolor` i przemalowuje je w miejscu —
 * także gracze w poczekalni. Odpowiedź to kolor, który obowiązuje od teraz.
 */
export function registerPlayerColorRoute(
  app: FastifyInstance,
  ctx: AppContext,
  deps: RealtimeDeps,
): void {
  app.post<{ Params: { id: string; userId: string } }>(
    '/api/campaigns/:id/players/:userId/color',
    { preHandler: requireGm },
    async (request, reply) => {
      const { id, userId } = request.params;
      const { color } = (request.body ?? {}) as { color?: unknown };
      // Cudza kampania i obcy gracz wyglądają jak nieistniejące.
      const campaign = await ownCampaignOf(ctx.prisma, id, request.user!.id);
      if (!campaign) return reply.code(404).send({ error: 'NOT_FOUND' });
      if (color !== null && !isPlayerColor(color)) {
        return reply.code(400).send({ error: 'INVALID_COLOR' });
      }
      const member = await ctx.prisma.campaignMember.findUnique({
        where: { campaignId_userId: { campaignId: campaign.id, userId } },
      });
      if (!member) return reply.code(404).send({ error: 'NOT_FOUND' });
      await ctx.prisma.campaignMember.update({ where: { id: member.id }, data: { color } });
      const members = await ctx.prisma.campaignMember.findMany({
        where: { campaignId: campaign.id },
        select: { userId: true, color: true, joinedAt: true },
      });
      const push: ChatRecolorPush = { userId, color: playerColors(members).get(userId)! };
      deps.io.to([campaignRoom(campaign.id), lobbyRoom(campaign.id)]).emit('chat:recolor', push);
      return push;
    },
  );
}

/**
 * „Usuń kampanię” MG (etap 57b). Do 57b kampanię usuwał tylko administrator,
 * razem z kontem MG — a kampanie „przed cofnięciem” zostałyby na zawsze.
 *
 * Potwierdzenie nazwą (jak cofnięcie), odmowa przy trwającej sesji
 * i przy kampanii otwartej u MG: stół, przy którym MG siedzi, nie znika mu
 * spod rąk. Kampania schodzi kaskadą z całą zawartością i czatem, katalog jej
 * grafik — z dysku; kopie kampanii (57b) zostają w `BACKUP_DIR`, a ich
 * dowiązania trzymają pliki przy życiu. Gracze, którzy należeli **tylko** do
 * niej (od 44b gracz ma jedną kampanię), odchodzą razem z nią, jak przy
 * usunięciu konta MG przez administratora — konto bez kampanii nie ma po co
 * istnieć. Dziennik sesji zostaje.
 *
 * Rejestrowana po gniazdach (`deps`): wylogowuje gniazda usuwanych graczy.
 */
export function registerCampaignDeleteRoute(
  app: FastifyInstance,
  ctx: AppContext,
  deps: RealtimeDeps,
): void {
  app.delete<{ Params: { id: string } }>(
    '/api/campaigns/:id',
    { preHandler: requireGm },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params;
      const { confirm } = (request.body ?? {}) as { confirm?: unknown };
      // Cudza kampania wygląda jak nieistniejąca — zanim ktokolwiek spojrzy na ciało.
      const campaign = await ownCampaignOf(ctx.prisma, id, user.id);
      if (!campaign) return reply.code(404).send({ error: 'CAMPAIGN_NOT_FOUND' });
      if (typeof confirm !== 'string') return reply.code(400).send({ error: 'BAD_REQUEST' });
      if (campaign.sessionStartedAt) return reply.code(409).send({ error: 'SESSION_ACTIVE' });
      if ((await getUserActiveCampaign(ctx.prisma, user))?.id === id) {
        return reply.code(409).send({ error: 'CAMPAIGN_OPEN' });
      }
      if (!confirmsCampaignName(confirm, campaign.name)) {
        return reply.code(400).send({ error: 'CONFIRM_MISMATCH' });
      }

      const players = await ctx.prisma.user.findMany({
        where: {
          role: ROLE_PLAYER,
          AND: [
            { memberships: { some: { campaignId: id } } },
            { memberships: { none: { campaignId: { not: id } } } },
          ],
        },
        select: { id: true },
      });
      const playerIds = players.map((player) => player.id);
      // Gniazda najpierw — nikt nie pisze do kampanii, która za chwilę zniknie.
      for (const playerId of playerIds) {
        await endUserSessions(ctx.prisma, deps.io, playerId, 'deleted');
      }
      await ctx.prisma.$transaction([
        ctx.prisma.campaign.delete({ where: { id } }),
        ctx.prisma.user.deleteMany({ where: { id: { in: playerIds } } }),
      ]);
      await rm(join(ctx.config.uploadsDir, 'campaigns', id), {
        recursive: true,
        force: true,
      }).catch((error: unknown) => {
        request.log.warn({ err: error, campaignId: id }, 'campaign uploads not removed');
      });
      await ctx.ai.refresh();
      notifyAdmins(deps.io);
      request.log.warn(
        { campaignId: id, name: campaign.name, players: playerIds.length },
        'campaign deleted by its GM',
      );
      const result: CampaignDeleteResult = { players: playerIds.length };
      return result;
    },
  );
}
