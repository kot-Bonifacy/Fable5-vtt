import type {
  ArchiveCharacterImportPayload,
  ArchiveImportResult,
  ArchiveSceneImportPayload,
} from '@vtt/shared';
import { ROLE_GM, polishPlural } from '@vtt/shared';
import { importCharacter, importScene } from '../archive.js';
import { defineEvent, RealtimeError, type RealtimeDeps } from './registry.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { emitSceneList } from './scenes.js';
import { requireValidOwner } from './characters.js';
import { localizeArchiveUploads } from '../campaign-uploads.js';
import { ownCampaign } from '../routes/helpers.js';

/**
 * Plik wymiany niesie adresy grafik, nie same grafiki — import przenosi je do
 * kampanii docelowej (etap 44b): plik z innej kampanii tego MG kopiuje,
 * nieosiągalny zdejmuje. Bez tego scena B wskazywałaby mapę leżącą u A.
 */
function localizedFile(deps: RealtimeDeps, campaignId: string, gmId: string, file: unknown) {
  return localizeArchiveUploads(file, {
    uploadsDir: deps.ctx.config.uploadsDir,
    campaignId,
    canRead: async (sourceId) => (await ownCampaign(deps.ctx.prisma, sourceId, gmId)) !== null,
  });
}

/**
 * Kopie zapasowe i import (etap 33) — strona gniazda.
 *
 * Kopie całej bazy („Zrób kopię teraz”, lista) od etapu 53 są trasami panelu
 * administratora (`routes/admin.ts`) — niosą kampanie wszystkich MG.
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

export const archiveCharacterImportEvent = defineEvent<
  ArchiveCharacterImportPayload,
  ArchiveImportResult
>({
  name: 'archive:character',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const ownerId = typeof payload?.ownerId === 'string' ? payload.ownerId : null;
    // Właściciel to gracz tej kampanii (etap 44b) — dawniej wystarczało
    // dowolne konto na serwerze, także gracz innego MG.
    await requireValidOwner(deps.ctx.prisma, campaignId, ownerId);
    const file = await localizedFile(deps, campaignId, user.id, payload?.file);
    const result = await importCharacter(deps.ctx.prisma, deps.ctx.cpred, file, {
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
    const file = await localizedFile(deps, campaignId, user.id, payload?.file);
    const result = await importScene(deps.ctx.prisma, file, {
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
          ? `Scena weszła w podglądzie. ${result.droppedBindings} ${polishPlural(
              result.droppedBindings,
              'figura straciła',
              'figury straciły',
              'figur straciło',
            )} powiązanie z kartą lub właścicielem — te karty nie istnieją w tej kampanii.`
          : 'Scena weszła w podglądzie — aktywuj ją, gdy będzie gotowa.',
    };
  },
});
