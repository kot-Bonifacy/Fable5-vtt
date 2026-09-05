import type {
  ArchiveCharacterImportPayload,
  ArchiveImportResult,
  ArchiveSceneImportPayload,
  SnapshotListView,
} from '@vtt/shared';
import { ROLE_GM, SNAPSHOT_RULES_DEFAULT } from '@vtt/shared';
import { importCharacter, importScene } from '../archive.js';
import { listSnapshots, snapshotPathsFor, takeSnapshotAndRotate } from '../snapshots.js';
import { defineEvent, RealtimeError, type RealtimeDeps } from './registry.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { emitSceneList } from './scenes.js';

/**
 * Kopie zapasowe i import (etap 33) — strona gniazda.
 *
 * Trzy rzeczy tu **nie** siedzą i to jest celowe:
 *  - **eksport** — pobranie pliku jest trasą REST (`routes/archive.ts`),
 *  - **przywracanie** — robi je skrypt przy zatrzymanym serwerze; przywrócenie
 *    kasuje bieżący stan, a jeden klik obok „Zapisz" to za mała odległość od
 *    czegoś, czego nic nie cofa (świadomie poza zakresem etapu),
 *  - **import kampanii** — plik z czatem to setki kilobajtów, a i tak nie ma go
 *    dokąd wczytać: kampania z pliku byłaby drugą kampanią, nie tą samą.
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/** Stan katalogu kopii — jedno miejsce, bo odsyłają go oba zdarzenia. */
async function snapshotList(deps: RealtimeDeps): Promise<SnapshotListView> {
  const backups = deps.ctx.config.backups;
  if (!backups) {
    return {
      directory: '',
      snapshots: [],
      rules: SNAPSHOT_RULES_DEFAULT,
      intervalMinutes: 0,
    };
  }
  return {
    directory: backups.dir,
    snapshots: await listSnapshots(backups.dir),
    rules: { keepHourly: backups.keepHourly, keepDaily: backups.keepDaily },
    intervalMinutes: backups.intervalMinutes,
  };
}

export const archiveListEvent = defineEvent<void, SnapshotListView>({
  name: 'archive:list',
  role: ROLE_GM,
  handler: async ({ deps }) => snapshotList(deps),
});

/**
 * „Zrób kopię teraz". Rotacja idzie razem z kopią — nigdy nie robi się jednego
 * bez drugiego, bo katalog bez rotacji rośnie po cichu.
 */
export const archiveSnapshotEvent = defineEvent<void, SnapshotListView>({
  name: 'archive:snapshot',
  role: ROLE_GM,
  handler: async ({ deps }) => {
    const paths = snapshotPathsFor(deps.ctx.config);
    if (!paths || !deps.ctx.config.backups) throw new RealtimeError('BACKUP_DISABLED');
    const rules = {
      keepHourly: deps.ctx.config.backups.keepHourly,
      keepDaily: deps.ctx.config.backups.keepDaily,
    };
    await takeSnapshotAndRotate(paths, rules, 'gm');
    return snapshotList(deps);
  },
});

export const archiveCharacterImportEvent = defineEvent<
  ArchiveCharacterImportPayload,
  ArchiveImportResult
>({
  name: 'archive:character',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const ownerId = typeof payload?.ownerId === 'string' ? payload.ownerId : null;
    if (ownerId) {
      const owner = await deps.ctx.prisma.user.findUnique({ where: { id: ownerId } });
      if (!owner) throw new RealtimeError('OWNER_NOT_FOUND');
    }
    const result = await importCharacter(deps.ctx.prisma, deps.ctx.cpred, payload?.file, {
      campaignId,
      ownerId,
      name: typeof payload?.name === 'string' ? payload.name : undefined,
    });
    if ('code' in result) throw new RealtimeError(result.code);

    const row = await deps.ctx.prisma.character.findUniqueOrThrow({ where: { id: result.id } });
    const view = toCharacterView(row, deps.ctx.cpred);
    await emitCharacterUpsert(deps, campaignId, view);
    return {
      id: view.id,
      name: view.name,
      note: ownerId ? null : 'Karta weszła jako NPC — właściciela nadaj na karcie.',
    };
  },
});

export const archiveSceneImportEvent = defineEvent<ArchiveSceneImportPayload, ArchiveImportResult>({
  name: 'archive:scene',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const result = await importScene(deps.ctx.prisma, payload?.file, {
      campaignId,
      actorId: user.id,
      name: typeof payload?.name === 'string' ? payload.name : undefined,
    });
    if ('code' in result) throw new RealtimeError(result.code);

    await emitSceneList(deps, campaignId);
    const scene = await deps.ctx.prisma.scene.findUniqueOrThrow({ where: { id: result.id } });
    return {
      id: scene.id,
      name: scene.name,
      note:
        result.droppedBindings > 0
          ? `Scena weszła w podglądzie. ${result.droppedBindings} ${
              result.droppedBindings === 1 ? 'figura straciła' : 'figur straciło'
            } powiązanie z kartą lub właścicielem — te karty nie istnieją w tej kampanii.`
          : 'Scena weszła w podglądzie — aktywuj ją, gdy będzie gotowa.',
    };
  },
});
