import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
  ArchiveFile,
  ArchiveImportResult,
  ArchiveRefusalCode,
  CampaignCopyListView,
} from '@vtt/shared';
import {
  ARCHIVE_IMPORT_MAX_BYTES_DEFAULT,
  ARCHIVE_IMPORT_PATH,
  ARCHIVE_PACKAGE_LIMITS_DEFAULT,
  CAMPAIGN_COPY_PATHS,
  confirmsCampaignName,
  polishPlural,
} from '@vtt/shared';
import type { AppContext } from '../context.js';
import { requireGm } from '../auth/guards.js';
import {
  exportCampaign,
  exportCharacter,
  exportScene,
  importCharacter,
  importScene,
  type ImportRefusal,
} from '../archive.js';
import { importCampaign, newRowId } from '../archive-campaign.js';
import {
  makeStagingDir,
  placeStagedFiles,
  rewriteUploadUrls,
  sendArchivePackage,
  stageArchiveUpload,
} from '../archive-package.js';
import { localizeArchiveUploads } from '../campaign-uploads.js';
import type { RealtimeDeps } from '../realtime/registry.js';
import { emitCharacterUpsert, toCharacterView } from '../realtime/character-io.js';
import { emitSceneList } from '../realtime/scenes.js';
import { dropExplorationCache, persistExploration } from '../realtime/exploration.js';
import { releaseSceneTargets } from '../realtime/target.js';
import { forgetCampaignUndo } from '../realtime/undo-buffer.js';
import { reseatCampaignGms } from '../realtime/sessions.js';
import { sendCampaignCopy } from '../campaign-copies.js';
import { rollbackCampaign } from '../campaign-rollback.js';
import { getUserActiveCampaign, ownCampaign } from './helpers.js';

/**
 * Pliki wymiany — pobranie i wczytanie trasami REST (etap 33, od 57a paczki ZIP).
 *
 * **Pobranie** niczego nie zmienia i kończy się plikiem na dysku MG, więc jest
 * trasą `GET`: przeglądarka sama czyta `Content-Disposition` i nie buduje
 * `Blob`-a w pamięci karty.
 *
 * **Wczytanie** to od 57a też trasa (`POST`, multipart), a nie zdarzenie
 * gniazda: kampania z grafikami waży lokalnie 4–28 MB, a Socket.IO ma sufit
 * 1 MB. Jeden przycisk „Wczytaj z pliku…” — rodzaj mówi manifest: karta
 * i scena wchodzą do kampanii otwartej u MG, kampania zawsze jako nowa
 * (decyzja MG 2). Stary plik JSON z etapu 33 wchodzi tą samą trasą, a jego
 * grafiki — jak dotąd — przez `localizeArchiveUploads`.
 */

const MAX_CAMPAIGN_NAME_LENGTH = 64;

/** Ten sam MG ma już kampanię o tej nazwie — wczytana dostaje dopisek z datą. */
async function freshCampaignName(ctx: AppContext, gmId: string, wanted: string): Promise<string> {
  const base = wanted.trim().slice(0, MAX_CAMPAIGN_NAME_LENGTH) || 'Kampania z pliku';
  const taken = await ctx.prisma.campaign.count({ where: { gmId, name: base } });
  if (taken === 0) return base;
  const day = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  const suffix = ` (z pliku ${day})`;
  return `${base.slice(0, MAX_CAMPAIGN_NAME_LENGTH - suffix.length)}${suffix}`;
}

function refuse(reply: FastifyReply, code: ArchiveRefusalCode | ImportRefusal['code'] | string) {
  return reply.code(code === 'ARCHIVE_PACKAGE_TOO_LARGE' ? 413 : 400).send({ error: code });
}

export function registerArchiveRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: RealtimeDeps,
): void {
  const gmOnly = { preHandler: requireGm };
  const uploadsDir = ctx.config.uploadsDir;

  app.get<{ Params: { id: string } }>(
    '/api/archive/character/:id',
    gmOnly,
    async (request, reply) => {
      // Karta z kampanii tego MG (etap 44b) — cudza wygląda jak nieistniejąca.
      const row = await ctx.prisma.character.findUnique({
        where: { id: request.params.id },
        select: { campaignId: true },
      });
      if (!row || !(await ownCampaign(ctx.prisma, row.campaignId, request.user!.id))) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      const file = await exportCharacter(ctx.prisma, request.params.id);
      if (!file) return reply.code(404).send({ error: 'NOT_FOUND' });
      return sendArchivePackage(reply, uploadsDir, 'character', file.payload.name, file);
    },
  );

  app.get<{ Params: { id: string } }>('/api/archive/scene/:id', gmOnly, async (request, reply) => {
    const row = await ctx.prisma.scene.findUnique({
      where: { id: request.params.id },
      select: { campaignId: true },
    });
    if (!row || !(await ownCampaign(ctx.prisma, row.campaignId, request.user!.id))) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    const file = await exportScene(ctx.prisma, request.params.id);
    if (!file) return reply.code(404).send({ error: 'NOT_FOUND' });
    const label = String(file.payload.scene.name ?? 'scena');
    return sendArchivePackage(reply, uploadsDir, 'scene', label, file);
  });

  /**
   * Zrzut całej kampanii. `?chat=0` pomija log — a manifest wtedy o tym mówi,
   * żeby po pliku było widać, czego w nim nie ma.
   */
  app.get<{ Querystring: { chat?: string } }>(
    '/api/archive/campaign',
    gmOnly,
    async (request, reply) => {
      const campaign = await getUserActiveCampaign(ctx.prisma, request.user!);
      if (!campaign) return reply.code(409).send({ error: 'NO_CAMPAIGN' });
      const includeChat = request.query.chat !== '0';
      const file = await exportCampaign(ctx.prisma, campaign.id, { includeChat });
      if (!file) return reply.code(404).send({ error: 'NOT_FOUND' });
      return sendArchivePackage(reply, uploadsDir, 'campaign', campaign.name, file);
    },
  );

  /* -------------------- kopie automatyczne (57b) -------------------- */

  /** Kopie otwartej kampanii — od najświeższej. */
  app.get(CAMPAIGN_COPY_PATHS.list, gmOnly, async (request, reply) => {
    const campaign = await getUserActiveCampaign(ctx.prisma, request.user!);
    if (!campaign) return reply.code(409).send({ error: 'NO_CAMPAIGN' });
    const copies = ctx.copies;
    const view: CampaignCopyListView = {
      enabled: copies !== undefined,
      campaignId: campaign.id,
      campaignName: campaign.name,
      sessionRunning: campaign.sessionStartedAt !== null,
      keepSessions: copies?.settings.keepSessions ?? 0,
      intervalMinutes: copies?.settings.intervalMinutes ?? 0,
      copies: copies ? await copies.list(campaign.id) : [],
    };
    return view;
  });

  /** Kopia jako paczka ZIP — ta sama, którą wczytuje „Wczytaj z pliku…”. */
  app.get<{ Params: { name: string } }>(
    '/api/archive/copies/:name',
    gmOnly,
    async (request, reply) => {
      const campaign = await getUserActiveCampaign(ctx.prisma, request.user!);
      if (!campaign || !ctx.copies) return reply.code(404).send({ error: 'NOT_FOUND' });
      const sent = await sendCampaignCopy(
        reply,
        ctx.copies.dirOf(campaign.id),
        request.params.name,
        campaign.name,
      );
      return sent ?? reply.code(404).send({ error: 'NOT_FOUND' });
    },
  );

  /** Kampanie w trakcie cofania — drugie kliknięcie nie startuje drugiego. */
  const rollingBack = new Set<string>();

  /**
   * „Cofnij do tej kopii” (decyzje MG 6–8): otwarta kampania, bez trwającej
   * sesji, potwierdzona nazwą. Po cofnięciu pamięć procesu o scenach tej
   * kampanii (eksploracja, cele, `Ctrl+Z`) schodzi, a gniazda MG dostają
   * pełny `state:sync` — gracze siedzą w poczekalni i zobaczą stan przy
   * następnej sesji.
   */
  app.post<{ Params: { name: string } }>(
    '/api/archive/copies/:name/restore',
    gmOnly,
    async (request, reply) => {
      const user = request.user!;
      const { confirm } = (request.body ?? {}) as { confirm?: unknown };
      if (typeof confirm !== 'string') return reply.code(400).send({ error: 'BAD_REQUEST' });
      const copies = ctx.copies;
      if (!copies) return reply.code(409).send({ error: 'COPIES_DISABLED' });
      const campaign = await getUserActiveCampaign(ctx.prisma, user);
      if (!campaign) return reply.code(409).send({ error: 'NO_CAMPAIGN' });
      if (campaign.sessionStartedAt) return reply.code(409).send({ error: 'SESSION_ACTIVE' });
      if (!confirmsCampaignName(confirm, campaign.name)) {
        return reply.code(400).send({ error: 'CONFIRM_MISMATCH' });
      }
      if (rollingBack.has(campaign.id)) return reply.code(409).send({ error: 'BUSY' });
      rollingBack.add(campaign.id);
      try {
        const sceneIds = async () =>
          (
            await ctx.prisma.scene.findMany({
              where: { campaignId: campaign.id },
              select: { id: true },
            })
          ).map((row) => row.id);
        // Pamięć drużyny z ostatniej sekundy — do kampanii „przed cofnięciem”.
        const before = await sceneIds();
        for (const id of before) await persistExploration(ctx.prisma, id);

        const result = await rollbackCampaign(ctx, copies, {
          campaignId: campaign.id,
          gmId: user.id,
          copyName: request.params.name,
        });
        if ('code' in result) {
          return reply
            .code(result.code === 'SESSION_ACTIVE' ? 409 : 404)
            .send({ error: result.code });
        }

        for (const id of new Set([...before, ...(await sceneIds())])) {
          dropExplorationCache(id);
          releaseSceneTargets(deps, id);
        }
        forgetCampaignUndo(campaign.id);
        // Brama AI zna kampanie z pamięci — „przed cofnięciem” to nowa kampania.
        await ctx.ai.refresh();
        await reseatCampaignGms(deps, campaign.id);
        request.log.warn(
          { campaignId: campaign.id, copy: result.copy.name, previous: result.previous.id },
          'campaign rolled back to a copy',
        );
        return result;
      } finally {
        rollingBack.delete(campaign.id);
      }
    },
  );

  app.post(ARCHIVE_IMPORT_PATH, gmOnly, async (request, reply) => {
    const user = request.user!;
    const maxBytes = ctx.config.archiveImportMaxBytes ?? ARCHIVE_IMPORT_MAX_BYTES_DEFAULT;
    const part = await request.file({ limits: { fileSize: maxBytes } });
    if (!part) return reply.code(400).send({ error: 'NO_FILE' });

    const staging = await makeStagingDir();
    try {
      const upload = join(staging, 'upload');
      await pipeline(part.file, createWriteStream(upload));
      if (part.file.truncated) return refuse(reply, 'ARCHIVE_PACKAGE_TOO_LARGE');
      const staged = await stageArchiveUpload(
        upload,
        join(staging, 'unpacked'),
        ARCHIVE_PACKAGE_LIMITS_DEFAULT,
      );
      if ('code' in staged) return refuse(reply, staged.code);

      const canRead = async (sourceId: string) =>
        (await ownCampaign(ctx.prisma, sourceId, user.id)) !== null;
      /** Grafiki z paczki do kampanii, reszta adresów jak w etapie 33. */
      const localize = async (campaignId: string): Promise<ArchiveFile<unknown>> => {
        const placed = await placeStagedFiles(staged.files, uploadsDir, campaignId);
        const rewritten = rewriteUploadUrls(staged.file, placed);
        return (await localizeArchiveUploads(rewritten, {
          uploadsDir,
          campaignId,
          canRead,
        })) as ArchiveFile<unknown>;
      };

      const kind = staged.file.manifest.kind;
      if (kind === 'campaign') {
        const campaignId = newRowId();
        const sourceName =
          String((staged.file.payload as { campaign?: { name?: unknown } }).campaign?.name ?? '') ||
          staged.file.manifest.campaignName;
        const name = await freshCampaignName(ctx, user.id, sourceName);
        const dropFiles = () =>
          rm(join(uploadsDir, 'campaigns', campaignId), { recursive: true, force: true });
        let result: Awaited<ReturnType<typeof importCampaign>>;
        try {
          const file = await localize(campaignId);
          result = await importCampaign(ctx.prisma, ctx.cpred, file, {
            campaignId,
            gmId: user.id,
            name,
          });
        } catch (error) {
          await dropFiles();
          throw error;
        }
        if ('code' in result) {
          await dropFiles();
          return refuse(reply, result.code);
        }
        // Brama AI (44d) zna kampanie z pamięci — nowa musi do niej trafić.
        await ctx.ai.refresh();
        const notes = ['Kampania jest na liście w Panelu MG — nie została otwarta.'];
        if (result.pendingPlayers.length > 0) {
          notes.push(
            `${result.pendingPlayers.length} ${polishPlural(
              result.pendingPlayers.length,
              'karta czeka',
              'karty czekają',
              'kart czeka',
            )} na gracza (${[...new Set(result.pendingPlayers)].join(', ')}) — przypisz je na karcie albo przy zaproszeniu.`,
          );
        }
        const done: ArchiveImportResult = {
          kind,
          id: result.id,
          name: result.name,
          note: notes.join(' '),
        };
        return reply.code(201).send(done);
      }

      const campaign = await getUserActiveCampaign(ctx.prisma, user);
      if (!campaign) return reply.code(409).send({ error: 'NO_CAMPAIGN' });
      const campaignId = campaign.id;
      const file = await localize(campaignId);

      if (kind === 'character') {
        const result = await importCharacter(ctx.prisma, ctx.cpred, file, {
          campaignId,
          gmId: user.id,
        });
        if ('code' in result) return refuse(reply, result.code);
        const row = await ctx.prisma.character.findUniqueOrThrow({ where: { id: result.id } });
        const view = toCharacterView(row, ctx.cpred);
        await emitCharacterUpsert(deps, campaignId, view);
        const done: ArchiveImportResult = {
          kind,
          id: view.id,
          name: view.name,
          note: result.pendingOwner
            ? `Karta czeka na gracza „${result.pendingOwner}” — przypisz ją na karcie albo przy zaproszeniu.`
            : result.ownerId
              ? 'Karta wróciła do swojego gracza.'
              : 'Karta weszła jako NPC.',
        };
        return reply.code(201).send(done);
      }

      const result = await importScene(ctx.prisma, file, { campaignId, actorId: user.id });
      if ('code' in result) return refuse(reply, result.code);
      await emitSceneList(deps, campaignId);
      const scene = await ctx.prisma.scene.findUniqueOrThrow({ where: { id: result.id } });
      const done: ArchiveImportResult = {
        kind,
        id: scene.id,
        name: scene.name,
        note:
          result.droppedBindings > 0
            ? `Scena weszła w podglądzie. ${result.droppedBindings} ${polishPlural(
                result.droppedBindings,
                'figura straciła',
                'figury straciły',
                'figur straciło',
              )} powiązanie z kartą lub właścicielem — te karty nie istnieją w tej kampanii.`
            : 'Scena weszła w podglądzie — aktywuj ją, gdy będzie gotowa.',
      };
      return reply.code(201).send(done);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  });
}
