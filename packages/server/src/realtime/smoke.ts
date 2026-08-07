import type { ScenePoint, SmokeClearPayload, SmokeSyncBroadcast, SmokeView } from '@vtt/shared';
import { ROLE_GM, SMOKE_SIDE_M_MAX, smokeAt, snapToSquareCentre } from '@vtt/shared';
import { toSceneView } from './scenes.js';
import type { Scene } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { fetchSceneSmoke, toSmokeView } from './smoke-io.js';
import { campaignRoom, sceneRoom } from './state.js';

/**
 * Smoke on the map (stage 16h) — core VTT storage, no game system.
 *
 * A cloud has one job and one number: it hangs over a square and makes what
 * happens inside it harder. It stops nothing, hides nobody and has no body
 * points, which is why this file is a third the size of `covers.ts` — there is
 * no catalogue to consult and no damage to take.
 *
 * Two things are worth writing down:
 *
 *  - **nobody places one by hand.** Clouds come from a smoke round going off
 *    (`ammo-effects`), because that is where the rulebook puts them. What the
 *    GM gets is the eraser: a cloud they can clear when the scene has moved on;
 *  - **RAW gives no duration.** „Zasnuwa kwadrat 10 m × 10 m gęstym dymem"
 *    (s. 347) and not a word about when it lifts, so the VTT does not invent
 *    one. The cloud hangs until the GM says otherwise — deliberately unlike the
 *    minute-long effects of the same stage, which the rules *do* time.
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/** Pushes the whole cloud list of one scene — the covers' bargain exactly. */
export async function emitSmoke(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Pick<Scene, 'id' | 'active'>,
): Promise<void> {
  const smoke = await fetchSceneSmoke(deps.ctx.prisma, scene.id);
  const payload = { sceneId: scene.id, smoke } satisfies SmokeSyncBroadcast;
  if (!scene.active) {
    deps.io.to(sceneRoom(scene.id)).emit('smoke:sync', payload);
    return;
  }
  const room = campaignRoom(campaignId);
  deps.io.to(room).emit('smoke:sync', { ...payload, seq: deps.seqs.next(room) });
}

/** Most clouds one scene may carry — a rail against a stuck launcher. */
export const SMOKE_MAX_PER_SCENE = 40;

/**
 * Lays a cloud down over the square a round went off on.
 *
 * The centre is snapped exactly as a blast is (16d): a cloud covers squares,
 * not a point somebody clicked, and drawing it half a square off would put
 * figures in and out of it for reasons nobody could see.
 */
export async function placeSmoke(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  centre: ScenePoint,
  cloud: { sideM: number; penalty: number; name?: string },
): Promise<SmokeView | null> {
  const sideM = Math.min(Math.max(cloud.sideM, 1), SMOKE_SIDE_M_MAX);
  const count = await deps.ctx.prisma.smoke.count({ where: { sceneId: scene.id } });
  if (count >= SMOKE_MAX_PER_SCENE) return null;
  const snapped = snapToSquareCentre(centre, toSceneView(scene));
  const row = await deps.ctx.prisma.smoke.create({
    data: {
      sceneId: scene.id,
      name: cloud.name && cloud.name.length > 0 ? cloud.name.slice(0, 40) : 'Dym',
      x: snapped.x,
      y: snapped.y,
      sideM,
      penalty: Math.round(cloud.penalty),
    },
  });
  await emitSmoke(deps, campaignId, scene);
  return toSmokeView(row);
}

/**
 * The clouds a figure standing at this point is inside, as named modifiers.
 *
 * Loaded per roll rather than cached: a scene holds a handful of rows, SQLite is
 * local, and a stale cache here would be a penalty applied to the wrong square.
 */
export async function smokeModifiersAt(
  deps: RealtimeDeps,
  scene: Scene,
  point: ScenePoint,
): Promise<SmokeView[]> {
  const clouds = await fetchSceneSmoke(deps.ctx.prisma, scene.id);
  if (clouds.length === 0) return [];
  return smokeAt(clouds, point, toSceneView(scene));
}

/**
 * The GM clears one cloud, or every cloud on a scene.
 *
 * The eraser rather than the pencil: nothing else in this stage lets a person
 * put smoke on the map, because nothing in the rules does either.
 */
export const smokeClearEvent = defineEvent<SmokeClearPayload, { cleared: number }>({
  name: 'smoke:clear',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (typeof payload?.sceneId !== 'string') throw new RealtimeError('BAD_REQUEST');
    const scene = await deps.ctx.prisma.scene.findUnique({ where: { id: payload.sceneId } });
    if (!scene || scene.campaignId !== campaignId) throw new RealtimeError('SCENE_NOT_FOUND');

    const removed =
      typeof payload.smokeId === 'number'
        ? await deps.ctx.prisma.smoke.deleteMany({
            where: { id: payload.smokeId, sceneId: scene.id },
          })
        : await deps.ctx.prisma.smoke.deleteMany({ where: { sceneId: scene.id } });
    if (removed.count > 0) await emitSmoke(deps, campaignId, scene);
    return { cleared: removed.count };
  },
});
