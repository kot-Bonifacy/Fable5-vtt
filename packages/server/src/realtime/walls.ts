import type {
  DoorTogglePayload,
  WallClearPayload,
  WallCreatePayload,
  WallDeletePayload,
  WallSyncBroadcast,
  WallUpdatePayload,
  WallView,
} from '@vtt/shared';
import { ROLE_GM, WALL_MAX_PER_SCENE, isWallKind, sanitizeWallChain } from '@vtt/shared';
import type { Scene } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignScene } from './scenes.js';
import { gmRoom } from './state.js';
import { emitSceneTokensToPlayers } from './tokens.js';
import { fetchSceneWalls, toWallView } from './walls-io.js';
import {
  emitVisionToPlayers,
  loadVisionContext,
  usesDynamicVision,
  visibleDoorsFor,
  visionSourcesFor,
} from './vision.js';

/**
 * Wall and door events (stage 18a) — core VTT, no game system involved.
 *
 * The geometry lives in `@vtt/shared` (`walls.ts`, `vision.ts`); this module
 * stores it, guards who may edit it and — the part that matters — makes sure it
 * never reaches a player socket.
 *
 * Every mutation here ends the same way: push the walls to the GM, then push
 * each player the *result* — a fresh field of view and a fresh token list.
 * Doing both from one place is what keeps the map and the data in step. A door
 * that opened without a token push would show a player a lit room with nobody
 * in it; a token push without the vision would do the reverse.
 */

/** The wall list goes to the GM room and nowhere else. */
async function emitWallsToGm(deps: RealtimeDeps, campaignId: string, sceneId: string) {
  const walls = await fetchSceneWalls(deps.ctx.prisma, sceneId);
  deps.io.to(gmRoom(campaignId)).emit('wall:sync', { sceneId, walls } satisfies WallSyncBroadcast);
}

/**
 * The full round trip of a wall change: the GM gets the new geometry, every
 * player gets what that geometry now lets them see.
 */
async function afterWallChange(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
): Promise<void> {
  await emitWallsToGm(deps, campaignId, scene.id);
  if (!usesDynamicVision(scene)) return;
  await emitVisionToPlayers(deps, campaignId, scene);
  await emitSceneTokensToPlayers(deps, campaignId, scene);
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

export const wallCreateEvent = defineEvent<WallCreatePayload, WallView[]>({
  name: 'wall:create',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    const segments = sanitizeWallChain(payload?.points);
    if (!segments) throw new RealtimeError('BAD_REQUEST');
    const kind = isWallKind(payload?.kind) ? payload.kind : 'wall';
    // The player flag is a door's business; on a wall it would be a promise the
    // UI never keeps.
    const playerToggle = kind === 'door' && payload?.playerToggle === true;

    const stored = await deps.ctx.prisma.wall.count({ where: { sceneId: scene.id } });
    if (stored + segments.length > WALL_MAX_PER_SCENE) {
      throw new RealtimeError('WALL_LIMIT_REACHED');
    }

    // One drawn chain is one transaction: a half-written wall would leave a
    // gap, and a gap in a wall is a hole light pours through.
    const created = await deps.ctx.prisma.$transaction(
      segments.map((segment) =>
        deps.ctx.prisma.wall.create({
          data: { sceneId: scene.id, kind, playerToggle, ...segment },
        }),
      ),
    );

    await afterWallChange(deps, campaignId, scene);
    return created.map(toWallView);
  },
});

export const wallUpdateEvent = defineEvent<WallUpdatePayload, WallView>({
  name: 'wall:update',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const wallId = payload?.wallId;
    if (typeof wallId !== 'number' || !Number.isInteger(wallId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const row = await deps.ctx.prisma.wall.findUnique({
      where: { id: wallId },
      include: { scene: true },
    });
    if (!row || row.scene.campaignId !== campaignId) throw new RealtimeError('WALL_NOT_FOUND');

    const patch = payload?.patch ?? {};
    const data: Record<string, unknown> = {};
    if (patch.kind !== undefined) {
      if (!isWallKind(patch.kind)) throw new RealtimeError('BAD_REQUEST');
      data.kind = patch.kind;
      // Retyping a door into a wall takes its player flag with it, and closes
      // it: an „open wall" is a state nothing in the UI could explain.
      if (patch.kind !== 'door') {
        data.playerToggle = false;
        data.open = false;
      }
    }
    if (patch.playerToggle !== undefined) {
      if (typeof patch.playerToggle !== 'boolean') throw new RealtimeError('BAD_REQUEST');
      const kind = (data.kind as string | undefined) ?? row.kind;
      data.playerToggle = kind === 'door' && patch.playerToggle;
    }

    const updated = await deps.ctx.prisma.wall.update({ where: { id: row.id }, data });
    await afterWallChange(deps, campaignId, row.scene);
    return toWallView(updated);
  },
});

export const wallDeleteEvent = defineEvent<WallDeletePayload>({
  name: 'wall:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const wallId = payload?.wallId;
    if (typeof wallId !== 'number' || !Number.isInteger(wallId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const row = await deps.ctx.prisma.wall.findUnique({
      where: { id: wallId },
      include: { scene: true },
    });
    if (!row || row.scene.campaignId !== campaignId) throw new RealtimeError('WALL_NOT_FOUND');

    await deps.ctx.prisma.wall.delete({ where: { id: row.id } });
    await afterWallChange(deps, campaignId, row.scene);
  },
});

export const wallClearEvent = defineEvent<WallClearPayload>({
  name: 'wall:clear',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    await deps.ctx.prisma.wall.deleteMany({ where: { sceneId: scene.id } });
    await afterWallChange(deps, campaignId, scene);
  },
});

/**
 * Opening and closing a door — the interaction that happens most at the table,
 * and the only one a player is allowed to perform on the wall layer.
 *
 * A player may work a door only when the GM flagged it *and* they can see it
 * right now. The second half matters: the flag alone would let a client toggle
 * a door on the far side of the map and read the answer, which is a map probe
 * dressed up as an interaction.
 */
export const doorToggleEvent = defineEvent<DoorTogglePayload, WallView>({
  name: 'door:toggle',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const wallId = payload?.wallId;
    if (typeof wallId !== 'number' || !Number.isInteger(wallId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const row = await deps.ctx.prisma.wall.findUnique({
      where: { id: wallId },
      include: { scene: true },
    });
    if (!row || row.scene.campaignId !== campaignId) throw new RealtimeError('WALL_NOT_FOUND');
    const wall = toWallView(row);
    if (wall.kind !== 'door') throw new RealtimeError('NOT_A_DOOR');

    const isGm = user.role === ROLE_GM;
    if (!isGm) {
      if (socket.data.viewedSceneId !== row.sceneId) throw new RealtimeError('SCENE_NOT_VIEWED');
      if (!wall.playerToggle) throw new RealtimeError('FORBIDDEN');
      const context = await loadVisionContext(deps.ctx.prisma, row.scene);
      const sources = await visionSourcesFor(deps.ctx.prisma, row.scene, user.id);
      const reachable = visibleDoorsFor(context, sources).some((door) => door.id === wall.id);
      // A door out of sight is refused the same way an unseen token is: the
      // rejection must not become a way to learn the door is there.
      if (!reachable) throw new RealtimeError('WALL_NOT_FOUND');
    }

    const open = typeof payload?.open === 'boolean' ? payload.open : !wall.open;
    const updated = await deps.ctx.prisma.wall.update({ where: { id: row.id }, data: { open } });
    await afterWallChange(deps, campaignId, row.scene);
    return toWallView(updated);
  },
});
