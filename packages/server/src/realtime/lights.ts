import type {
  LightCreatePayload,
  LightDeletePayload,
  LightSyncBroadcast,
  LightUpdatePayload,
  LightView,
  SceneLightingPayload,
  SceneUpdateBroadcast,
  SceneView,
  TokenLightTogglePayload,
  TokenView,
} from '@vtt/shared';
import {
  LIGHT_DEFAULT_BRIGHT_M,
  LIGHT_DEFAULT_COLOR,
  LIGHT_DEFAULT_DIM_M,
  LIGHT_MAX_PER_SCENE,
  ROLE_GM,
  orderLightRadii,
  sanitizeDarkSight,
  sanitizeLightPatch,
} from '@vtt/shared';
import type { Scene } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { fetchSceneLights, toLightView } from './lights-io.js';
import { requireCampaignScene, toSceneView } from './scenes.js';
import { campaignRoom, gmRoom, sceneRoom } from './state.js';
import {
  emitSceneTokensToPlayers,
  emitTokenUpsert,
  requireCampaignToken,
  toTokenView,
} from './tokens.js';
import { emitVisionToPlayers, usesDynamicVision } from './vision.js';

/**
 * Lights, torches and darkness (stage 18b) — core VTT, no game system involved.
 *
 * The geometry lives in `@vtt/shared` (`lights.ts`); this module stores it,
 * guards who may edit it and — the part that matters — makes sure the rows never
 * reach a player socket. A lamp's illuminated shape is the shape of the room it
 * stands in, so the list travels to the GM alone, exactly like the walls.
 *
 * Every mutation here ends the same way as a wall change: push the lights to the
 * GM, then push each player the *result* — a fresh field of view with its light
 * mask, and a fresh token list. A light that came on without a token push would
 * show a player a lit room with nobody in it; the reverse would show a figure
 * standing in the dark.
 */

/** The light list goes to the GM room and nowhere else. */
async function emitLightsToGm(deps: RealtimeDeps, campaignId: string, sceneId: string) {
  const lights = await fetchSceneLights(deps.ctx.prisma, sceneId);
  deps.io
    .to(gmRoom(campaignId))
    .emit('light:sync', { sceneId, lights } satisfies LightSyncBroadcast);
}

/**
 * The full round trip of a light change: the GM gets the new list, every player
 * gets what that light now lets them see.
 */
async function afterLightChange(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
): Promise<void> {
  await emitLightsToGm(deps, campaignId, scene.id);
  if (!usesDynamicVision(scene)) return;
  await emitVisionToPlayers(deps, campaignId, scene);
  await emitSceneTokensToPlayers(deps, campaignId, scene);
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/** Loads a light row and proves it belongs to this campaign. */
async function requireCampaignLight(deps: RealtimeDeps, campaignId: string, lightId: unknown) {
  if (typeof lightId !== 'number' || !Number.isInteger(lightId)) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const row = await deps.ctx.prisma.mapLight.findUnique({
    where: { id: lightId },
    include: { scene: true },
  });
  if (!row || row.scene.campaignId !== campaignId) throw new RealtimeError('LIGHT_NOT_FOUND');
  return row;
}

export const lightCreateEvent = defineEvent<LightCreatePayload, LightView>({
  name: 'light:create',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    // The position is required; everything else falls back to a warm bulb, so
    // dropping a lamp on the map is one click rather than a form.
    const patch = sanitizeLightPatch({
      x: payload?.x,
      y: payload?.y,
      brightM: payload?.brightM ?? LIGHT_DEFAULT_BRIGHT_M,
      dimM: payload?.dimM ?? LIGHT_DEFAULT_DIM_M,
      color: payload?.color ?? LIGHT_DEFAULT_COLOR,
      flicker: payload?.flicker ?? false,
    });
    if (!patch || patch.x === undefined || patch.y === undefined) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const stored = await deps.ctx.prisma.mapLight.count({ where: { sceneId: scene.id } });
    if (stored >= LIGHT_MAX_PER_SCENE) throw new RealtimeError('LIGHT_LIMIT_REACHED');

    const ordered = orderLightRadii(patch.brightM ?? 0, patch.dimM ?? 0);
    const created = await deps.ctx.prisma.mapLight.create({
      data: {
        sceneId: scene.id,
        x: patch.x,
        y: patch.y,
        ...ordered,
        color: patch.color ?? LIGHT_DEFAULT_COLOR,
        flicker: patch.flicker ?? false,
      },
    });
    await afterLightChange(deps, campaignId, scene);
    return toLightView(created);
  },
});

export const lightUpdateEvent = defineEvent<LightUpdatePayload, LightView>({
  name: 'light:update',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const row = await requireCampaignLight(deps, campaignId, payload?.lightId);
    const patch = sanitizeLightPatch(payload?.patch ?? {});
    if (!patch) throw new RealtimeError('BAD_REQUEST');

    // The radii are ordered only once the pair is complete: a patch touching
    // just the bright one still has to end up inside the dim one.
    const ordered = orderLightRadii(patch.brightM ?? row.brightM, patch.dimM ?? row.dimM);
    const updated = await deps.ctx.prisma.mapLight.update({
      where: { id: row.id },
      data: {
        ...(patch.x !== undefined ? { x: patch.x } : {}),
        ...(patch.y !== undefined ? { y: patch.y } : {}),
        ...ordered,
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.flicker !== undefined ? { flicker: patch.flicker } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      },
    });
    await afterLightChange(deps, campaignId, row.scene);
    return toLightView(updated);
  },
});

export const lightDeleteEvent = defineEvent<LightDeletePayload>({
  name: 'light:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const row = await requireCampaignLight(deps, campaignId, payload?.lightId);
    await deps.ctx.prisma.mapLight.delete({ where: { id: row.id } });
    await afterLightChange(deps, campaignId, row.scene);
  },
});

/**
 * The switch on a carried light — the one light operation a *player* performs.
 *
 * Not a field of `token:update` (which is GM-only by design) and not guarded by
 * ownership of the scene: sneaking down a corridor with the torch out is a
 * tactical decision, and routing it through the GM would turn it into
 * paperwork. The GM may flip anybody's; a player only their own.
 */
export const tokenLightToggleEvent = defineEvent<TokenLightTogglePayload, TokenView>({
  name: 'token:light',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.tokenId,
    );
    const isGm = user.role === ROLE_GM;
    if (!isGm) {
      // A hidden token is refused the way an unseen one is: the rejection must
      // not become a way to learn the token is there.
      if (token.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
      const character = token.characterId
        ? await deps.ctx.prisma.character.findUnique({ where: { id: token.characterId } })
        : null;
      const controls = token.ownerId === user.id || character?.ownerId === user.id;
      if (!controls) throw new RealtimeError('FORBIDDEN');
    }
    // Nothing to switch: a token without a lamp has no state to flip, and
    // pretending otherwise would let a player conjure light out of a click.
    if (token.lightDimM <= 0 && token.lightBrightM <= 0) throw new RealtimeError('NO_LIGHT');

    const on = typeof payload?.on === 'boolean' ? payload.on : !token.lightOn;
    const updated = await deps.ctx.prisma.token.update({
      where: { id: token.id },
      data: { lightOn: on },
    });
    // The upsert path already knows how to answer „who may see this token now?"
    // per viewer on a dynamic scene — which is exactly what putting a torch out
    // changes, and not only for the token holding it.
    await emitTokenUpsert(deps, campaignId, scene, updated);
    return toTokenView(updated, true);
  },
});

/**
 * Darkness and the sight it leaves (stage 18b).
 *
 * Its own event rather than fields of the generic scene patch, for the reason
 * the visibility mode has one: turning the lights out takes every token in an
 * unlit spot away from the players who could see it a moment ago, so it needs a
 * handler that re-filters their lists — not a field somebody flips in passing
 * while renaming the scene.
 */
export const sceneLightingEvent = defineEvent<SceneLightingPayload, SceneView>({
  name: 'scene:lighting',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    const data: { dark?: boolean; darkSightM?: number } = {};
    if (payload?.dark !== undefined) {
      if (typeof payload.dark !== 'boolean') throw new RealtimeError('BAD_REQUEST');
      data.dark = payload.dark;
    }
    if (payload?.darkSightM !== undefined) {
      const sight = sanitizeDarkSight(payload.darkSightM);
      if (sight === null) throw new RealtimeError('BAD_REQUEST');
      data.darkSightM = sight;
    }
    if (Object.keys(data).length === 0) return toSceneView(scene);

    const updated = await deps.ctx.prisma.scene.update({ where: { id: scene.id }, data });
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
    // The scene update alone would leave every player's mask and token list
    // describing the lighting of a moment ago.
    if (usesDynamicVision(updated)) {
      await emitVisionToPlayers(deps, campaignId, updated);
      await emitSceneTokensToPlayers(deps, campaignId, updated);
    }
    return view;
  },
});
