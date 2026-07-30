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
  isWallInReach,
  loadVisionContext,
  usesDynamicVision,
  visibleDoorsFor,
  viewerSightFor,
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
      // Retyping a door into a wall takes its player flag and its bolt with it,
      // and closes it: an „open wall" is a state nothing in the UI could explain.
      if (patch.kind !== 'door') {
        data.playerToggle = false;
        data.open = false;
        data.locked = false;
      }
    }
    if (patch.playerToggle !== undefined) {
      if (typeof patch.playerToggle !== 'boolean') throw new RealtimeError('BAD_REQUEST');
      const kind = (data.kind as string | undefined) ?? row.kind;
      data.playerToggle = kind === 'door' && patch.playerToggle;
    }
    if (patch.locked !== undefined) {
      if (typeof patch.locked !== 'boolean') throw new RealtimeError('BAD_REQUEST');
      const kind = (data.kind as string | undefined) ?? row.kind;
      const locked = kind === 'door' && patch.locked;
      data.locked = locked;
      // Bolting a door shuts it. „Open and locked" is a real thing — a door
      // wedged so it cannot be closed — but it is not what a GM means when they
      // click the padlock in the middle of a scene, and the state that click was
      // reaching for would otherwise need a second one.
      if (locked) data.open = false;
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
 * A player has to clear four conditions, and the order they are checked in is
 * the point of this handler. Each one may only reveal what the previous one has
 * already conceded:
 *
 *  1. the GM flagged the door as theirs (`playerToggle`) — else `FORBIDDEN`;
 *  2. they can see it right now — else `WALL_NOT_FOUND`, the same answer an
 *     unseen token gives, because a rejection must not become a way to learn
 *     that a door is there at all;
 *  3. one of their tokens stands within arm's reach — else `DOOR_OUT_OF_REACH`
 *     (stage 18d). Safe to name: they were already told the door exists by being
 *     shown it;
 *  4. it is not bolted — else `DOOR_LOCKED`. Last on purpose. „Locked" is the
 *     one fact about a door that is learned by pulling the handle, so a player
 *     halfway across the room must not get it: they would be probing the map for
 *     which doors matter without their character touching anything.
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
      // The whole sight rather than just the origins: on a dark scene a door
      // has to be lit to be worked, and the guard must agree with the list the
      // player was sent — or the handle they can see would refuse them.
      const sight = await viewerSightFor(deps.ctx.prisma, row.scene, user.id, context);
      const visible = visibleDoorsFor(context, sight.sources, sight.lighting).some(
        (door) => door.id === wall.id,
      );
      if (!visible) throw new RealtimeError('WALL_NOT_FOUND');
      if (!isWallInReach(context, sight.sources, wall)) {
        throw new RealtimeError('DOOR_OUT_OF_REACH');
      }
      if (wall.locked) throw new RealtimeError('DOOR_LOCKED');
    }

    const open = typeof payload?.open === 'boolean' ? payload.open : !wall.open;
    const updated = await deps.ctx.prisma.wall.update({ where: { id: row.id }, data: { open } });
    await afterWallChange(deps, campaignId, row.scene);
    return toWallView(updated);
  },
});
