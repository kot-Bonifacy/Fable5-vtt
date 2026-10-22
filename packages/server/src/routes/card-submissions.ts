import { createReadStream, createWriteStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import type { ArchiveFile, CardSubmissionEntry } from '@vtt/shared';
import {
  ARCHIVE_PACKAGE_LIMITS_DEFAULT,
  CARD_SUBMISSION_PATHS,
  ROLE_GM,
  ROLE_PLAYER,
  archiveRefusal,
  cardSubmissionHeadline,
  cardSubmissionStatus,
  isContainerCard,
  parseCharacterData,
} from '@vtt/shared';
import type { AppContext } from '../context.js';
import { requireAuth, requireGm } from '../auth/guards.js';
import { importCharacter, stringifyJsonColumn, type CharacterArchive } from '../archive.js';
import {
  makeStagingDir,
  placeStagedFiles,
  rewriteUploadUrls,
  stageArchiveUpload,
} from '../archive-package.js';
import {
  cardSubmissionsRoot,
  dropSubmission,
  isSubmissionId,
  newSubmissionId,
  readSubmission,
  relativeInside,
  submissionDir,
  submissionExpiry,
  submissionFile,
  sweepCardSubmissions,
  writeSubmission,
} from '../card-submissions.js';
import { localizeArchiveUploads } from '../campaign-uploads.js';
import { campaignInCombat } from '../realtime/combat-lock.js';
import { emitCharacterUpsert, toCharacterView } from '../realtime/character-io.js';
import {
  INCLUDE_CHAT_NAMES,
  deliverChatMessageTo,
  insertChatMessage,
  toChatMessageView,
} from '../realtime/chat-io.js';
import type { RealtimeDeps } from '../realtime/registry.js';
import { getUserActiveCampaign, ownCampaign } from './helpers.js';

/**
 * Karta gracza zgłoszona z pliku (etap 57c, decyzja MG 9).
 *
 * **Gracz zgłasza, MG wprowadza.** `POST …/submissions` przyjmuje paczkę karty
 * (albo stary JSON z etapu 33), sprawdza ją tak samo jak „Wczytaj z pliku…”
 * MG i odkłada rozpakowaną do poczekalni (`card-submissions.ts`). Do MG idzie
 * karta czatu `cardsubmission` z podglądem — imię, Rola, Poziom, portret — i
 * „Przyjmij” / „Odrzuć”, a „Czeka na MG” liczy ją z czatu, jak prośbę o Test.
 * Przyjęcie zakłada kartę tą samą drogą co wczytanie karty przez MG
 * (`importCharacter`), tylko od razu z właścicielem i zgodą na grę.
 *
 * Wzór: prośba o operację (#41) — stan żyje na karcie czatu, więc przeżywa
 * restart serwera i przeładowanie strony po obu stronach.
 */

/** Paczka jednej karty z portretem — rząd wielkości mniej niż kampania. */
const SUBMISSION_MAX_BYTES = 32 * 1024 * 1024;

const PORTRAIT_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function registerCardSubmissionRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: RealtimeDeps,
): void {
  const root = cardSubmissionsRoot(ctx.config);
  const uploadsDir = ctx.config.uploadsDir;
  /** Karty w trakcie decyzji — drugie „Przyjmij” nie założy drugiej karty. */
  const inFlight = new Set<number>();

  async function updateCard(
    campaignId: string,
    messageId: number,
    entry: CardSubmissionEntry,
  ): Promise<void> {
    const stored = await ctx.prisma.chatMessage.update({
      where: { id: messageId },
      data: { payload: JSON.stringify(entry) },
      include: INCLUDE_CHAT_NAMES,
    });
    await deliverChatMessageTo(
      deps,
      campaignId,
      toChatMessageView(stored),
      [entry.userId],
      true,
      'chat:update',
    );
  }

  /** Otwarte zgłoszenie tego gracza w tej kampanii — jedno naraz. */
  async function pendingOf(campaignId: string, userId: string): Promise<boolean> {
    const rows = await ctx.prisma.chatMessage.findMany({
      where: { campaignId, authorId: userId, kind: 'cardsubmission' },
      select: { payload: true },
    });
    return rows.some((row) => {
      if (!row.payload) return false;
      const entry = JSON.parse(row.payload) as CardSubmissionEntry;
      return cardSubmissionStatus(entry) === 'open';
    });
  }

  app.post(CARD_SUBMISSION_PATHS.submit, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    if (user.role !== ROLE_PLAYER) return reply.code(403).send({ error: 'FORBIDDEN' });
    const campaign = await getUserActiveCampaign(ctx.prisma, user);
    if (!campaign) return reply.code(409).send({ error: 'NO_CAMPAIGN' });
    // 21.10: gracz nie zakłada nowej postaci w walce — także z pliku.
    if (await campaignInCombat(ctx.prisma, campaign.id)) {
      return reply.code(409).send({ error: 'COMBAT_LOCKED' });
    }
    if (await pendingOf(campaign.id, user.id)) {
      return reply.code(409).send({ error: 'SUBMISSION_PENDING' });
    }
    await sweepCardSubmissions(root);

    const part = await request.file({ limits: { fileSize: SUBMISSION_MAX_BYTES } });
    if (!part) return reply.code(400).send({ error: 'NO_FILE' });

    const id = newSubmissionId();
    const dir = submissionDir(root, id);
    const staging = await makeStagingDir();
    let kept = false;
    try {
      const upload = join(staging, 'upload');
      await pipeline(part.file, createWriteStream(upload));
      if (part.file.truncated) {
        return reply.code(413).send({ error: 'ARCHIVE_PACKAGE_TOO_LARGE' });
      }
      const staged = await stageArchiveUpload(upload, join(dir, 'files'), {
        ...ARCHIVE_PACKAGE_LIMITS_DEFAULT,
        maxBytes: SUBMISSION_MAX_BYTES * 4,
      });
      if ('code' in staged) return reply.code(400).send({ error: staged.code });
      const refusal = archiveRefusal(staged.file, 'character');
      if (refusal) return reply.code(400).send({ error: refusal });

      const payload = staged.file.payload as Partial<CharacterArchive>;
      const name = typeof payload.name === 'string' ? payload.name.trim().slice(0, 64) : '';
      if (!name) return reply.code(400).send({ error: 'ARCHIVE_EMPTY' });
      const data = parseCharacterData(stringifyJsonColumn(payload.data, '{}'), ctx.cpred);
      if (isContainerCard(data)) return reply.code(400).send({ error: 'SUBMISSION_CONTAINER' });

      const portraitDisk =
        typeof payload.portraitUrl === 'string' ? staged.files.get(payload.portraitUrl) : undefined;
      const expiresAt = submissionExpiry();
      await writeSubmission(root, id, {
        campaignId: campaign.id,
        userId: user.id,
        expiresAt,
        file: staged.file,
        files: [...staged.files].map(([url, disk]) => [url, relativeInside(dir, disk)]),
        portrait: portraitDisk ? relativeInside(dir, portraitDisk) : null,
      });

      const role = ctx.cpred.roles.find((entry) => entry.id === data.roleId) ?? null;
      const entry: CardSubmissionEntry = {
        submissionId: id,
        userId: user.id,
        userName: user.name,
        name,
        roleName: role?.name ?? null,
        roleRank: role ? data.roleAbilityRank : null,
        hasPortrait: Boolean(portraitDisk),
        expiresAt,
        status: 'open',
      };
      const message = await insertChatMessage(ctx.prisma, {
        campaignId: campaign.id,
        authorId: user.id,
        kind: 'cardsubmission',
        text: cardSubmissionHeadline(entry),
        payload: JSON.stringify(entry),
      });
      await deliverChatMessageTo(deps, campaign.id, message, [user.id], true);
      kept = true;
      request.log.info({ campaignId: campaign.id, submission: id }, 'card submitted');
      return reply.code(201).send({ messageId: message.id });
    } finally {
      await rm(staging, { recursive: true, force: true });
      if (!kept) await dropSubmission(root, id);
    }
  });

  /**
   * Portret ze zgłoszonej paczki — zanim karta wejdzie, plik nie leży
   * w `uploads/`, więc podgląd idzie tą trasą. Widzi go MG kampanii
   * i zgłaszający; reszta dostaje 404.
   */
  app.get<{ Params: { id: string } }>(
    '/api/archive/submissions/:id/portrait',
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = request.user!;
      const id = request.params.id;
      const stored = isSubmissionId(id) ? await readSubmission(root, id) : null;
      const allowed =
        stored !== null &&
        (user.role === ROLE_GM
          ? (await ownCampaign(ctx.prisma, stored.campaignId, user.id)) !== null
          : stored.userId === user.id);
      const path = allowed && stored.portrait ? submissionFile(root, id, stored.portrait) : null;
      const type = path ? PORTRAIT_TYPES[extname(path).toLowerCase()] : undefined;
      if (!path || !type || !(await stat(path).catch(() => null))?.isFile()) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      return reply
        .header('Content-Type', type)
        .header('Cache-Control', 'private, max-age=300')
        .send(createReadStream(path));
    },
  );

  app.post<{ Params: { messageId: string } }>(
    '/api/archive/submissions/:messageId/respond',
    { preHandler: requireGm },
    async (request, reply) => {
      const user = request.user!;
      const messageId = Number(request.params.messageId);
      const { action } = (request.body ?? {}) as { action?: unknown };
      if (!Number.isInteger(messageId) || (action !== 'accept' && action !== 'refuse')) {
        return reply.code(400).send({ error: 'BAD_REQUEST' });
      }
      const message = await ctx.prisma.chatMessage.findUnique({ where: { id: messageId } });
      // Cudza kampania wygląda jak brak zgłoszenia (44b).
      if (
        !message ||
        message.kind !== 'cardsubmission' ||
        !message.payload ||
        !(await ownCampaign(ctx.prisma, message.campaignId, user.id))
      ) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      if (inFlight.has(messageId)) return reply.code(409).send({ error: 'SUBMISSION_CLOSED' });
      inFlight.add(messageId);
      try {
        const campaignId = message.campaignId;
        const entry = JSON.parse(message.payload) as CardSubmissionEntry;
        const status = cardSubmissionStatus(entry);
        if (status === 'expired') {
          await dropSubmission(root, entry.submissionId);
          if (entry.status === 'open') {
            await updateCard(campaignId, messageId, { ...entry, status: 'expired' });
          }
          return reply.code(409).send({ error: 'SUBMISSION_EXPIRED' });
        }
        if (status !== 'open') return reply.code(409).send({ error: 'SUBMISSION_CLOSED' });

        if (action === 'refuse') {
          await dropSubmission(root, entry.submissionId);
          const closed: CardSubmissionEntry = { ...entry, status: 'refused', byName: user.name };
          await updateCard(campaignId, messageId, closed);
          return { status: closed.status };
        }

        const stored = await readSubmission(root, entry.submissionId);
        if (!stored || stored.campaignId !== campaignId) {
          await updateCard(campaignId, messageId, { ...entry, status: 'expired' });
          return reply.code(409).send({ error: 'SUBMISSION_EXPIRED' });
        }
        const member = await ctx.prisma.campaignMember.findUnique({
          where: { campaignId_userId: { campaignId, userId: entry.userId } },
          select: { userId: true },
        });
        if (!member) return reply.code(409).send({ error: 'NOT_MEMBER' });

        const dir = submissionDir(root, entry.submissionId);
        const files = new Map<string, string>();
        for (const [url, path] of stored.files) {
          const disk = submissionFile(root, entry.submissionId, path);
          if (disk) files.set(url, disk);
        }
        const placed = await placeStagedFiles(files, uploadsDir, campaignId);
        const rewritten = rewriteUploadUrls(stored.file, placed);
        const file = (await localizeArchiveUploads(rewritten, {
          uploadsDir,
          campaignId,
          canRead: async (sourceId) => (await ownCampaign(ctx.prisma, sourceId, user.id)) !== null,
        })) as ArchiveFile<unknown>;
        const result = await importCharacter(ctx.prisma, ctx.cpred, file, {
          campaignId,
          gmId: user.id,
          ownerId: entry.userId,
          playReady: true,
        });
        if ('code' in result) return reply.code(400).send({ error: result.code });

        const row = await ctx.prisma.character.findUniqueOrThrow({ where: { id: result.id } });
        await emitCharacterUpsert(deps, campaignId, toCharacterView(row, ctx.cpred));
        const closed: CardSubmissionEntry = {
          ...entry,
          status: 'accepted',
          byName: user.name,
          characterId: result.id,
        };
        await updateCard(campaignId, messageId, closed);
        await rm(dir, { recursive: true, force: true });
        request.log.info({ campaignId, characterId: result.id }, 'card submission accepted');
        return { status: closed.status, characterId: result.id };
      } finally {
        inFlight.delete(messageId);
      }
    },
  );
}
