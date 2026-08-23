import type { DrawingUpsertBroadcast, SceneObjectKind, SceneUndoResult } from '@vtt/shared';
import { ROLE_GM, sceneObjectCountLabel } from '@vtt/shared';
import type { Scene } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignScene } from './scenes.js';
import { takeLastDeletion, type UndoEntry } from './undo-buffer.js';
import { afterWallChange } from './walls.js';
import { emitCovers } from './covers.js';
import { emitZones } from './zones-io.js';
import { afterLightChange } from './lights.js';
import { emitAccessPoints } from './netrun-io.js';
import { emitNoteUpsert, toNoteView } from './notes.js';
import { emitDrawingEvent, toDrawingView } from './drawings.js';

/**
 * `Ctrl+Z` po usunięciu obiektu ze sceny (etap 27k).
 *
 * Cofanie żyje **na serwerze**, i to nie z wygody. Trzy powody, wszystkie
 * sprawdzone przy rozpoznaniu 23.08:
 *
 *  - **serwer jest autorytatywny** (zasada z `CLAUDE.md`) — klient odtwarzający
 *    obiekt własnym `create` mógłby przy okazji podać inne PW osłony albo inną
 *    Architekturę gniazda;
 *  - **wiersz wraca z tym samym id.** Odtworzenie u klienta znaczyłoby
 *    `create` + `patch` i **nowe id** za każdym razem, a `createWalls` nie
 *    przyjmuje `locked`, `createCover` nie przyjmuje bieżących PW, a
 *    `placeNetAccessPoint` ani nazwy, ani notatki;
 *  - **kosz „usuń wszystkie" odkłada całą grupę jako jedną pozycję**, więc
 *    jedno `Ctrl+Z` cofa cały kosz. To zastępuje okna potwierdzenia, których
 *    kosze nie miały (a `window.confirm` i tak zawiesza sterowanie
 *    przeglądarką przez CDP — patrz `pulapki-dev.md`).
 *
 * Czego cofanie **nie** przywróci: runu w Sieci zerwanego przez usunięcie
 * gniazda. Run kończy się nieodwracalnie, wraca samo gniazdo (zapisane w
 * `decyzje-i-uproszczenia.md`).
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/**
 * Czy ten wiersz wolno wstawić z powrotem pod dawnym kluczem obcym?
 *
 * Architektura Sieci albo autor rysunku mogli zniknąć **po** usunięciu obiektu.
 * Wstawka z martwym kluczem wysadziłaby `Ctrl+Z` błędem bazy, więc martwe
 * wskazanie zamieniamy na `null` tam, gdzie kolumna to znosi — gniazdo wraca
 * jako „martwe", strefa bez Architektury. To jest ta sama umowa, którą karta
 * postaci ma z `compendiumId` od etapu 07.
 */
async function liveArchitectureId(
  deps: RealtimeDeps,
  campaignId: string,
  raw: unknown,
): Promise<string | null> {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const row = await deps.ctx.prisma.netArchitecture.findUnique({ where: { id: raw } });
  return row && row.campaignId === campaignId ? row.id : null;
}

async function liveTokenId(deps: RealtimeDeps, raw: unknown): Promise<string | null> {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const row = await deps.ctx.prisma.token.findUnique({ where: { id: raw } });
  return row ? row.id : null;
}

/**
 * Wstawia wiersze z powrotem i rozsyła skutek tak, jak zrobiłoby to zwykłe
 * utworzenie obiektu tego rodzaju.
 *
 * Zwraca liczbę faktycznie odtworzonych wierszy: obiekt, którego id ktoś w
 * międzyczasie zajął (albo którego scena zniknęła), po prostu nie wraca, a
 * reszta grupy owszem — kosz cofnięty w połowie jest lepszy niż wyjątek.
 */
async function restoreRows(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  entry: UndoEntry,
): Promise<number> {
  const prisma = deps.ctx.prisma;
  let restored = 0;

  switch (entry.kind) {
    case 'wall': {
      for (const row of entry.rows) {
        await prisma.wall.create({ data: row as never }).then(
          () => (restored += 1),
          () => undefined,
        );
      }
      if (restored > 0) await afterWallChange(deps, campaignId, scene);
      break;
    }
    case 'cover': {
      for (const row of entry.rows) {
        await prisma.cover.create({ data: row as never }).then(
          () => (restored += 1),
          () => undefined,
        );
      }
      if (restored > 0) await emitCovers(deps, campaignId, scene);
      break;
    }
    case 'zone': {
      for (const row of entry.rows) {
        const data = {
          ...row,
          architectureId: await liveArchitectureId(deps, campaignId, row.architectureId),
          tokenId: await liveTokenId(deps, row.tokenId),
        };
        await prisma.defenseZone.create({ data: data as never }).then(
          () => (restored += 1),
          () => undefined,
        );
      }
      if (restored > 0) await emitZones(deps, campaignId, scene.id);
      break;
    }
    case 'light': {
      for (const row of entry.rows) {
        await prisma.mapLight.create({ data: row as never }).then(
          () => (restored += 1),
          () => undefined,
        );
      }
      if (restored > 0) await afterLightChange(deps, campaignId, scene);
      break;
    }
    case 'netpoint': {
      for (const row of entry.rows) {
        const data = {
          ...row,
          architectureId: await liveArchitectureId(deps, campaignId, row.architectureId),
        };
        await prisma.netAccessPoint.create({ data: data as never }).then(
          () => (restored += 1),
          () => undefined,
        );
      }
      if (restored > 0) await emitAccessPoints(deps, campaignId, scene.id);
      break;
    }
    case 'note': {
      for (const row of entry.rows) {
        const created = await prisma.mapNote.create({ data: row as never }).catch(() => null);
        if (!created) continue;
        restored += 1;
        emitNoteUpsert(deps, campaignId, toNoteView(created));
      }
      break;
    }
    case 'drawing': {
      for (const row of entry.rows) {
        // Rysunek bez żywego autora nie wraca: kolumna jest wymagana, a wpisanie
        // tam kogokolwiek innego przepisałoby cudzą kreskę na nowe nazwisko.
        const author = await prisma.user.findUnique({
          where: { id: String(row.authorId ?? '') },
        });
        if (!author) continue;
        const created = await prisma.mapDrawing
          .create({ data: row as never, include: { author: { select: { name: true } } } })
          .catch(() => null);
        if (!created) continue;
        const view = toDrawingView(created);
        if (!view) continue;
        restored += 1;
        emitDrawingEvent(deps, campaignId, scene, created.gmOnly, 'drawing:upsert', {
          drawing: view,
        } satisfies Omit<DrawingUpsertBroadcast, 'seq'>);
      }
      break;
    }
  }

  return restored;
}

/**
 * Zdanie, które MG zobaczy na czacie. Buduje je serwer, bo to on wie, ile
 * wierszy naprawdę wróciło — klient zna tylko własne wciśnięcie klawisza.
 *
 * „Przywrócono" plus biernik, bo to jedyna konstrukcja, która wychodzi poprawnie
 * dla wszystkich trzech polskich form liczby naraz: „przywrócono ścianę",
 * „przywrócono 3 ściany", „przywrócono 7 ścian". Zdanie z rzeczownikiem w
 * mianowniku wymagałoby jeszcze uzgodnienia rodzaju czasownika.
 */
function undoNote(kind: SceneObjectKind, count: number): string {
  return `Przywrócono ${sceneObjectCountLabel(kind, count)}.`;
}

export const sceneUndoEvent = defineEvent<{ sceneId?: string }, SceneUndoResult>({
  name: 'scene:undo',
  // Bez `role`: gracz też cofa — ale wyłącznie własne usunięcia, a jedyne, co
  // gracz może usunąć, to jego własny rysunek. Rozstrzyga to `userId` w
  // buforze, nie rola, więc żadna gałąź „jeśli gracz" nie jest tu potrzebna.
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    if (user.role !== ROLE_GM && socket.data.viewedSceneId !== scene.id) {
      throw new RealtimeError('SCENE_NOT_VIEWED');
    }

    const entry = takeLastDeletion(campaignId, user.id, scene.id);
    if (!entry) throw new RealtimeError('NOTHING_TO_UNDO');

    const restored = await restoreRows(deps, campaignId, scene, entry);
    if (restored === 0) throw new RealtimeError('UNDO_FAILED');
    return { kind: entry.kind, count: restored, note: undoNote(entry.kind, restored) };
  },
});
