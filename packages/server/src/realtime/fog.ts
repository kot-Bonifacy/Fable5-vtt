import type {
  FogPaintBroadcast,
  FogPaintPayload,
  FogResetPayload,
  FogShapeView,
  FogSyncBroadcast,
  FogTogglePayload,
  FogUndoPayload,
  SceneUpdateBroadcast,
} from '@vtt/shared';
import { FOG_MAX_SHAPES, ROLE_GM, fullSceneReveal, sanitizeFogShape } from '@vtt/shared';
import type { Scene } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { fetchFogState, toFogRowData } from './fog-io.js';
import { requireCampaignScene, toSceneView } from './scenes.js';
import { campaignRoom, sceneRoom } from './state.js';
import { emitSceneTokensToPlayers } from './tokens.js';

/**
 * Fog of war (stage 17) — core VTT, no game system involved.
 *
 * The geometry itself lives in `@vtt/shared` (`fog.ts`); this module only
 * stores it, guards who may paint and decides who hears about it.
 *
 * Two rules shape every emission here:
 *
 *  - **The mask is public.** Players receive every fog shape, because the shape
 *    list *is* what they are allowed to see — knowing where the revealed area
 *    ends leaks nothing they cannot already read off their own screen.
 *  - **Painting changes who exists.** A reveal can bring an enemy token into a
 *    player's world and a re-cover can take one away, so every fog change is
 *    followed by a filtered token push to the players viewing that scene.
 */

/**
 * Sends the whole fog to everyone looking at the scene. Used after a reset, an
 * undo or the per-scene toggle — anything a single appended shape cannot
 * express. Sequenced on the active scene, targeted for a GM preview.
 */
export async function emitFogSync(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
): Promise<void> {
  const fog = await fetchFogState(deps.ctx.prisma, scene);
  if (!scene.active) {
    deps.io.to(sceneRoom(scene.id)).emit('fog:sync', { fog } satisfies FogSyncBroadcast);
    return;
  }
  const room = campaignRoom(campaignId);
  const broadcast: FogSyncBroadcast = { seq: deps.seqs.next(room), fog };
  deps.io.to(room).emit('fog:sync', broadcast);
}

/**
 * The full round trip of a fog change: tell every viewer about the new mask,
 * then re-send each player the tokens they may now see. Doing both from one
 * place is what keeps the map and the data in step — a reveal that pushed the
 * mask but not the tokens would show players an empty lit room.
 */
async function afterFogChange(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  emitMask: () => Promise<void> | void,
): Promise<void> {
  await emitMask();
  await emitSceneTokensToPlayers(deps, campaignId, scene);
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

export const fogPaintEvent = defineEvent<FogPaintPayload, FogShapeView>({
  name: 'fog:paint',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    const shape = sanitizeFogShape(payload?.shape);
    if (!shape) throw new RealtimeError('BAD_REQUEST');

    const stored = await deps.ctx.prisma.fogShape.count({ where: { sceneId: scene.id } });
    if (stored >= FOG_MAX_SHAPES) throw new RealtimeError('FOG_LIMIT_REACHED');

    const row = await deps.ctx.prisma.fogShape.create({
      data: { sceneId: scene.id, ...toFogRowData(shape) },
    });
    const view: FogShapeView = { ...shape, id: row.id };

    await afterFogChange(deps, campaignId, scene, () => {
      if (!scene.active) {
        deps.io
          .to(sceneRoom(scene.id))
          .emit('fog:paint', { sceneId: scene.id, shape: view } satisfies FogPaintBroadcast);
        return;
      }
      const room = campaignRoom(campaignId);
      const broadcast: FogPaintBroadcast = {
        seq: deps.seqs.next(room),
        sceneId: scene.id,
        shape: view,
      };
      deps.io.to(room).emit('fog:paint', broadcast);
    });
    return view;
  },
});

export const fogResetEvent = defineEvent<FogResetPayload>({
  name: 'fog:reset',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    const mode = payload?.mode;
    if (mode !== 'reveal' && mode !== 'hide') throw new RealtimeError('BAD_REQUEST');

    // Both resets start by clearing the list — the base state is „covered", so
    // „cover everything" needs no shape at all, and „reveal everything" needs
    // exactly one. That also compacts a session's worth of brush strokes into
    // a single row.
    await deps.ctx.prisma.$transaction(async (tx) => {
      await tx.fogShape.deleteMany({ where: { sceneId: scene.id } });
      if (mode === 'reveal') {
        await tx.fogShape.create({
          data: { sceneId: scene.id, ...toFogRowData(fullSceneReveal(scene)) },
        });
      }
    });

    await afterFogChange(deps, campaignId, scene, () => emitFogSync(deps, campaignId, scene));
  },
});

export const fogToggleEvent = defineEvent<FogTogglePayload, boolean>({
  name: 'fog:toggle',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    if (typeof payload?.enabled !== 'boolean') throw new RealtimeError('BAD_REQUEST');
    if (scene.fogEnabled === payload.enabled) return payload.enabled;

    const updated = await deps.ctx.prisma.scene.update({
      where: { id: scene.id },
      data: { fogEnabled: payload.enabled },
    });
    // Painted shapes survive the switch, so turning fog back on restores the
    // exploration the group had already done instead of starting from black.
    await afterFogChange(deps, campaignId, updated, async () => {
      const view = toSceneView(updated);
      if (updated.active) {
        const room = campaignRoom(campaignId);
        deps.io.to(room).emit('scene:update', {
          seq: deps.seqs.next(room),
          scene: view,
        } satisfies SceneUpdateBroadcast);
      } else {
        deps.io
          .to(sceneRoom(updated.id))
          .emit('scene:update', { scene: view } satisfies SceneUpdateBroadcast);
      }
      await emitFogSync(deps, campaignId, updated);
    });
    return payload.enabled;
  },
});

export const fogUndoEvent = defineEvent<FogUndoPayload>({
  name: 'fog:undo',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    const last = await deps.ctx.prisma.fogShape.findFirst({
      where: { sceneId: scene.id },
      orderBy: { id: 'desc' },
    });
    if (!last) return;
    await deps.ctx.prisma.fogShape.delete({ where: { id: last.id } });
    // A removed shape can uncover whatever an older one had revealed, so the
    // whole mask goes out rather than a „delete this shape" delta.
    await afterFogChange(deps, campaignId, scene, () => emitFogSync(deps, campaignId, scene));
  },
});
