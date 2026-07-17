import type { Socket } from 'socket.io';
import type {
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
  ROLE_GM,
  normalizeGridOffset,
  sanitizeSceneName,
  sanitizeScenePatch,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
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
    },
    metersPerSquare: scene.metersPerSquare,
  };
}

function toSummary(scene: Scene): SceneSummary {
  return {
    id: scene.id,
    name: scene.name,
    active: scene.active,
    hasBackground: scene.backgroundUrl !== null,
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
async function emitSceneList(deps: RealtimeDeps, campaignId: string): Promise<void> {
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

    const scene = await deps.ctx.prisma.scene.create({ data: { name, campaignId } });
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
        data.backgroundUrl = patch.background.url;
        data.backgroundWidth = patch.background.width;
        data.backgroundHeight = patch.background.height;
        // A new map usually defines the playable area — adopt its size unless
        // the patch sets dimensions explicitly.
        if (patch.width === undefined) data.width = patch.background.width;
        if (patch.height === undefined) data.height = patch.background.height;
      }
    }
    if (patch.width !== undefined) data.width = patch.width;
    if (patch.height !== undefined) data.height = patch.height;
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
    if (patch.name !== undefined || patch.background !== undefined) {
      await emitSceneList(deps, campaignId);
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
