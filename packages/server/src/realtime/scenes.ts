import type { Socket } from 'socket.io';
import type {
  ChaseSettings,
  SceneActivateBroadcast,
  SceneCreatePayload,
  SceneIdPayload,
  SceneListBroadcast,
  SceneSummary,
  SceneUpdateBroadcast,
  SceneUpdatePayload,
  SceneView,
  SceneViewBroadcast,
  SessionUser,
} from '@vtt/shared';
import {
  CHASE_AMBIENCE,
  ROLE_GM,
  DEFAULT_CHASE_SETTINGS,
  chaseRoadByUrl,
  defaultChaseDirection,
  isAmbiencePreset,
  isChaseDirection,
  isSceneKind,
  isPlayerMoveMode,
  isSceneVisibility,
  normalizeGridOffset,
  sanitizeSceneName,
  sanitizeScenePatch,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireOwnUploadUrl } from '../campaign-uploads.js';
import { forgetScene } from './undo-buffer.js';
import { placeOwedCreationTokens } from './creation.js';
import { releaseTargetsOffScene } from './target.js';
import { endCampaignSneaks } from './sneak.js';
import { settleChaseAfterSceneChange } from './chase.js';
import { campaignRoom, gmRoom, sceneRoom } from './state.js';

export function toSceneView(scene: Scene): SceneView {
  return {
    id: scene.id,
    name: scene.name,
    active: scene.active,
    background:
      scene.backgroundUrl && scene.backgroundWidth && scene.backgroundHeight
        ? {
            url: scene.backgroundUrl,
            width: scene.backgroundWidth,
            height: scene.backgroundHeight,
          }
        : null,
    width: scene.width,
    height: scene.height,
    gridMode: scene.gridMode === 'gridless' ? 'gridless' : 'grid',
    grid: {
      sizePx: scene.gridSizePx,
      offsetX: scene.gridOffsetX,
      offsetY: scene.gridOffsetY,
      color: scene.gridColor,
      alpha: scene.gridAlpha,
      visible: scene.gridVisible,
      players: scene.gridPlayers,
    },
    metersPerSquare: scene.metersPerSquare,
    // A row written before stage 18a, or edited by hand, must never fall
    // through to „open" — an unreadable mode is treated as hand-painted fog,
    // the setting that hides rather than reveals.
    visibility: isSceneVisibility(scene.visibility) ? scene.visibility : 'fog',
    dark: scene.dark,
    darkSightM: scene.darkSightM,
    explore: scene.explore,
    partySight: scene.partySight,
    // Ruch graczy (etap 45) — jedzie też do graczy, bo to ich klient ma nie
    // podnosić figury, liczyć pulę i umieć powiedzieć, dlaczego. Nieczytelna
    // wartość to „stop": zatrzymuje, zamiast puszczać.
    playerMove: isPlayerMoveMode(scene.playerMove) ? scene.playerMove : 'stop',
    ambience: isAmbiencePreset(scene.ambience) ? scene.ambience : 'none',
    // Miejsce startu drużyny (11.09): para kolumn albo nic. Jedzie też do
    // graczy — to ich kamera je czyta, gdy nie mają jeszcze figury na mapie.
    spawn:
      scene.spawnX !== null && scene.spawnY !== null ? { x: scene.spawnX, y: scene.spawnY } : null,
    kind: isSceneKind(scene.kind) ? scene.kind : 'map',
    chase: chaseSettingsOf(scene),
  };
}

/** Ustawienia pościgu z wiersza sceny (etap 65b); nieczytelne pola — domyślne. */
export function chaseSettingsOf(
  scene: Pick<
    Scene,
    'chaseDirection' | 'chaseTempo' | 'chaseRunning' | 'chaseRoadFrom' | 'chaseRoadTo'
  >,
): ChaseSettings {
  return {
    direction: isChaseDirection(scene.chaseDirection) ? scene.chaseDirection : 'right',
    tempo: scene.chaseTempo,
    running: scene.chaseRunning,
    road:
      scene.chaseRoadFrom !== null &&
      scene.chaseRoadTo !== null &&
      scene.chaseRoadTo > scene.chaseRoadFrom
        ? { from: scene.chaseRoadFrom, to: scene.chaseRoadTo }
        : null,
  };
}

function toSummary(scene: Scene): SceneSummary {
  return {
    id: scene.id,
    name: scene.name,
    active: scene.active,
    hasBackground: scene.backgroundUrl !== null,
    hasSpawn: scene.spawnX !== null && scene.spawnY !== null,
  };
}

/** All campaign scenes, oldest first — GM manager data, never for players. */
export async function fetchSceneList(
  prisma: PrismaClient,
  campaignId: string,
): Promise<SceneSummary[]> {
  const scenes = await prisma.scene.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
  });
  return scenes.map(toSummary);
}

export async function getActiveScene(
  prisma: PrismaClient,
  campaignId: string,
): Promise<Scene | null> {
  return prisma.scene.findFirst({ where: { campaignId, active: true } });
}

export async function getSceneById(prisma: PrismaClient, sceneId: string): Promise<Scene | null> {
  return prisma.scene.findUnique({ where: { id: sceneId } });
}

/** Pushes the fresh scene list to GM sockets (targeted — no seq). */
export async function emitSceneList(deps: RealtimeDeps, campaignId: string): Promise<void> {
  const payload: SceneListBroadcast = {
    scenes: await fetchSceneList(deps.ctx.prisma, campaignId),
  };
  deps.io.to(gmRoom(campaignId)).emit('scene:list', payload);
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

export async function requireCampaignScene(
  prisma: PrismaClient,
  campaignId: string,
  sceneId: unknown,
): Promise<Scene> {
  if (typeof sceneId !== 'string' || sceneId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const scene = await getSceneById(prisma, sceneId);
  if (!scene || scene.campaignId !== campaignId) throw new RealtimeError('SCENE_NOT_FOUND');
  return scene;
}

/** Local and remote sockets share this shape — all we need to move viewers. */
interface ViewerSocket {
  data: unknown;
  join(room: string): void | Promise<void>;
  leave(room: string): void | Promise<void>;
}

/** Moves a socket's viewed scene: leaves the old scene room, joins the new. */
export async function switchViewedScene(
  socket: ViewerSocket,
  sceneId: string | null,
): Promise<void> {
  const previous = (socket.data as { viewedSceneId: string | null }).viewedSceneId;
  if (previous === sceneId) return;
  if (previous) await socket.leave(sceneRoom(previous));
  if (sceneId) await socket.join(sceneRoom(sceneId));
  (socket.data as { viewedSceneId: string | null }).viewedSceneId = sceneId;
}

export const sceneCreateEvent = defineEvent<SceneCreatePayload, SceneView>({
  name: 'scene:create',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const name = sanitizeSceneName(payload?.name);
    if (name === null) throw new RealtimeError('INVALID_NAME');
    // Scena pościgu (etap 65b) startuje otwarta, bez ciemności i pamięci mapy,
    // w skali 1 m na kratkę: na autostradzie nie ma ścian, a widzenie z auta
    // tylko by migało. Ruch graczy stoi (Stop), jak na każdej nowej scenie.
    const chase = payload?.kind === 'chase';
    const scene = await deps.ctx.prisma.scene.create({
      data: {
        name,
        campaignId,
        ...(chase
          ? {
              kind: 'chase',
              // Kolumna ma domyślnie „w prawo” (zmiana domyślnej w SQLite to
              // przebudowa tabeli), więc kierunek pościgu wpisujemy sami.
              chaseDirection: DEFAULT_CHASE_SETTINGS.direction,
              visibility: 'open',
              dark: false,
              explore: false,
              metersPerSquare: 1,
              ambience: CHASE_AMBIENCE,
            }
          : {}),
      },
    });
    await emitSceneList(deps, campaignId);
    return toSceneView(scene);
  },
});

export const sceneUpdateEvent = defineEvent<SceneUpdatePayload, SceneView>({
  name: 'scene:update',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    const patch = sanitizeScenePatch(payload?.patch);
    if (patch === null) throw new RealtimeError('BAD_REQUEST');

    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.background !== undefined) {
      if (patch.background === null) {
        data.backgroundUrl = null;
        data.backgroundWidth = null;
        data.backgroundHeight = null;
      } else {
        // Wbudowana droga kreatora pościgu (03.11) leży w `/art/roads/`, nie
        // w plikach kampanii — wpuszczamy tylko adres z listy i jej rozmiar.
        const builtIn = chaseRoadByUrl(patch.background.url);
        if (!builtIn) requireOwnUploadUrl(patch.background.url, campaignId);
        data.backgroundUrl = patch.background.url;
        data.backgroundWidth = builtIn?.width ?? patch.background.width;
        data.backgroundHeight = builtIn?.height ?? patch.background.height;
        // A new map usually defines the playable area — adopt its size unless
        // the patch sets dimensions explicitly.
        if (patch.width === undefined) data.width = data.backgroundWidth;
        if (patch.height === undefined) data.height = data.backgroundHeight;
        // Droga na scenie pościgu (65b) biegnie zwykle wzdłuż dłuższego boku
        // mapy — nowe tło zgaduje kierunek jazdy, chyba że łata go podaje.
        if ((patch.kind ?? scene.kind) === 'chase' && patch.chase?.direction === undefined) {
          data.chaseDirection = defaultChaseDirection(
            patch.background.width,
            patch.background.height,
          );
        }
      }
    }
    if (patch.width !== undefined) data.width = patch.width;
    if (patch.height !== undefined) data.height = patch.height;
    if (patch.playerMove !== undefined) data.playerMove = patch.playerMove;
    if (patch.ambience !== undefined) data.ambience = patch.ambience;
    if (patch.kind !== undefined) data.kind = patch.kind;
    // Mapa zamieniona w pościg nie ma własnego kierunku (kolumna stoi na
    // „w prawo”) — zgaduje go tło, a bez tła domyślne „w lewo” (MG, 04.11).
    if (
      patch.kind === 'chase' &&
      scene.kind !== 'chase' &&
      patch.chase?.direction === undefined &&
      data.chaseDirection === undefined
    ) {
      data.chaseDirection =
        scene.backgroundWidth && scene.backgroundHeight
          ? defaultChaseDirection(scene.backgroundWidth, scene.backgroundHeight)
          : DEFAULT_CHASE_SETTINGS.direction;
    }
    // Scena przełączona na pościg rusza z odgłosem jazdy, chyba że łata sama
    // ustawia otoczenie; powrót do mapy gasi jazdę, której mapa nie wybrała.
    if (patch.kind !== undefined && patch.kind !== scene.kind && patch.ambience === undefined) {
      if (patch.kind === 'chase' && (scene.ambience === 'none' || scene.ambience === 'street')) {
        data.ambience = CHASE_AMBIENCE;
      } else if (patch.kind !== 'chase' && scene.ambience === CHASE_AMBIENCE) {
        data.ambience = 'none';
      }
    }
    if (patch.chase !== undefined) {
      const chase = patch.chase;
      if (chase.direction !== undefined) data.chaseDirection = chase.direction;
      if (chase.tempo !== undefined) data.chaseTempo = chase.tempo;
      if (chase.running !== undefined) data.chaseRunning = chase.running;
      if (chase.road !== undefined) {
        data.chaseRoadFrom = chase.road?.from ?? null;
        data.chaseRoadTo = chase.road?.to ?? null;
      }
    }
    if (patch.spawn !== undefined) {
      data.spawnX = patch.spawn === null ? null : patch.spawn.x;
      data.spawnY = patch.spawn === null ? null : patch.spawn.y;
    }
    if (patch.gridMode !== undefined) data.gridMode = patch.gridMode;
    if (patch.metersPerSquare !== undefined) data.metersPerSquare = patch.metersPerSquare;
    if (patch.grid !== undefined) {
      const sizePx = patch.grid.sizePx ?? scene.gridSizePx;
      data.gridSizePx = sizePx;
      data.gridOffsetX = normalizeGridOffset(patch.grid.offsetX ?? scene.gridOffsetX, sizePx);
      data.gridOffsetY = normalizeGridOffset(patch.grid.offsetY ?? scene.gridOffsetY, sizePx);
      if (patch.grid.color !== undefined) data.gridColor = patch.grid.color;
      if (patch.grid.alpha !== undefined) data.gridAlpha = patch.grid.alpha;
      if (patch.grid.visible !== undefined) data.gridVisible = patch.grid.visible;
      if (patch.grid.players !== undefined) data.gridPlayers = patch.grid.players;
    }

    const updated = await deps.ctx.prisma.scene.update({ where: { id: scene.id }, data });
    const view = toSceneView(updated);

    if (updated.active) {
      // Everyone views the active scene — sequenced campaign-wide broadcast.
      const room = campaignRoom(campaignId);
      const broadcast: SceneUpdateBroadcast = { seq: deps.seqs.next(room), scene: view };
      deps.io.to(room).emit('scene:update', broadcast);
    } else {
      // GM-only preview — targeted at that scene's viewers, no seq.
      const broadcast: SceneUpdateBroadcast = { scene: view };
      deps.io.to(sceneRoom(updated.id)).emit('scene:update', broadcast);
    }
    if (patch.name !== undefined || patch.background !== undefined || patch.spawn !== undefined) {
      await emitSceneList(deps, campaignId);
    }
    // Etap 65b: zmiana rodzaju, kierunku albo pasa jezdni przestawia auta —
    // `chase → map` zdejmuje je z drogi i wysadza figury na miejscu, reszta
    // przycina auta do nowego pasa i przesadza figury w fotelach.
    if (
      patch.kind !== undefined ||
      patch.chase?.direction !== undefined ||
      patch.chase?.road !== undefined ||
      patch.background !== undefined ||
      patch.grid !== undefined
    ) {
      await settleChaseAfterSceneChange(deps, campaignId, updated);
    }
    return view;
  },
});

export const sceneDeleteEvent = defineEvent<SceneIdPayload>({
  name: 'scene:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    // Deleting the scene everyone is looking at would strand the players —
    // the GM has to activate another scene first.
    if (scene.active) throw new RealtimeError('SCENE_ACTIVE');

    await deps.ctx.prisma.scene.delete({ where: { id: scene.id } });
    // Bufor cofania (27k) trzyma całe wiersze z `sceneId` w środku. Scena poszła
    // kaskadą, więc pozycja, która chciałaby je odtworzyć, wysadziłaby `Ctrl+Z`
    // błędem klucza obcego — zapominamy ją razem ze sceną.
    forgetScene(campaignId, scene.id);

    // Kick remaining viewers (GM tabs) of the deleted scene back to nothing.
    const viewers = await deps.io.in(sceneRoom(scene.id)).fetchSockets();
    for (const viewer of viewers) {
      await switchViewedScene(viewer, null);
      const reset: SceneViewBroadcast = { scene: null };
      viewer.emit('scene:view', reset);
    }
    await emitSceneList(deps, campaignId);
  },
});

export const sceneActivateEvent = defineEvent<SceneIdPayload>({
  name: 'scene:activate',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);

    const activated = await deps.ctx.prisma.$transaction(async (tx) => {
      await tx.scene.updateMany({ where: { campaignId }, data: { active: false } });
      return tx.scene.update({ where: { id: scene.id }, data: { active: true } });
    });
    const view = toSceneView(activated);

    // Players always follow the active scene; the GM keeps their own view —
    // unless they are not viewing anything yet (connected before any scene
    // was active), in which case following the activation is the only
    // sensible destination.
    const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
    for (const member of sockets) {
      const data = member.data as { user: SessionUser; viewedSceneId: string | null };
      if (data.user.role !== ROLE_GM || data.viewedSceneId === null) {
        await switchViewedScene(member, view.id);
      }
    }

    const room = campaignRoom(campaignId);
    const broadcast: SceneActivateBroadcast = { seq: deps.seqs.next(room), scene: view };
    deps.io.to(room).emit('scene:activate', broadcast);
    await emitSceneList(deps, campaignId);
    // Trwałe cele (etap 50c) schodzą ze zmianą sceny — na nowej mapie stary
    // cel nie ma znaczenia, a po powrocie wskazywałby zeszłą sytuację.
    releaseTargetsOffScene(deps, campaignId, activated.id);
    // Skradanie (etap 61, decyzja MG 5) kończy się ze zmianą sceny.
    await endCampaignSneaks(deps, campaignId);
    // #9 (26.09): postać przyjęta do gry bez aktywnej sceny czekała na żeton.
    // Po rozgłoszeniu, żeby gracze stali już na tej scenie, gdy figura wejdzie.
    await placeOwedCreationTokens(deps, campaignId, activated);
  },
});

export const sceneViewEvent = defineEvent<SceneIdPayload, SceneView>({
  name: 'scene:view',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    await switchViewedScene(socket, scene.id);
    return toSceneView(scene);
  },
});

/** Initial viewed scene of a fresh socket: the campaign's active scene. */
export async function joinInitialScene(
  deps: Pick<RealtimeDeps, 'ctx'>,
  socket: Socket,
  campaignId: string,
): Promise<void> {
  const active = await getActiveScene(deps.ctx.prisma, campaignId);
  await switchViewedScene(socket, active?.id ?? null);
}
