import type { Socket } from 'socket.io';
import type {
  DrawingView,
  FogState,
  LightView,
  MapNoteView,
  SceneSummary,
  SceneView,
  SessionUser,
  StateSyncPayload,
  WallView,
} from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import { defineEvent, type RealtimeDeps } from './registry.js';
import { computePresence } from './presence.js';
import { fetchHistoryPage } from './chat-io.js';
import { explorationMaskFor } from './exploration.js';
import { fetchFogState } from './fog-io.js';
import { fetchSceneDrawings } from './drawings.js';
import { fetchSceneNotes } from './notes.js';
import { fetchSceneWalls } from './walls-io.js';
import { fetchSceneLights } from './lights-io.js';
import { computeViewerVision, type ViewerVision } from './vision.js';
import { fetchSceneList, getSceneById, toSceneView } from './scenes.js';
import { fetchSceneTokensFor } from './tokens.js';
import { fetchCombatFor } from './combat.js';
import { fetchCharactersFor } from './character-io.js';
import { fetchBotsFor } from './bots.js';
import { aiStatusFor } from './ai.js';
import { buildCompendiumSync } from './compendium.js';
import { campaignRoom } from './state.js';

/**
 * Builds the full room state for one client: current seq, presence and the
 * latest chat page visible to that user. Sent on connect, after reconnect and
 * on demand (`state:request`) when the client detects a seq gap.
 */
export async function buildStateSync(
  deps: RealtimeDeps,
  socket: Socket,
  user: SessionUser,
): Promise<StateSyncPayload> {
  const campaign = socket.data.campaign;
  if (!campaign) {
    return {
      seq: 0,
      campaign: null,
      presence: [],
      messages: [],
      hasMoreHistory: false,
      scene: null,
      scenes: [],
      tokens: [],
      fog: null,
      drawings: [],
      notes: [],
      walls: [],
      lights: [],
      vision: null,
      openings: [],
      exploration: null,
      characters: [],
      bots: [],
      ai: aiStatusFor(deps, user.role === ROLE_GM),
      compendium: await buildCompendiumSync(deps, null),
      combat: null,
    };
  }
  const viewedSceneId = socket.data.viewedSceneId;
  // Tokens and fog both need the scene row (grid scale, fog switch), so the
  // scene is fetched first rather than in the parallel batch below.
  const viewedScene = viewedSceneId ? await getSceneById(deps.ctx.prisma, viewedSceneId) : null;
  const [
    presence,
    history,
    scenes,
    tokens,
    fog,
    drawings,
    notes,
    walls,
    lights,
    vision,
    characters,
    bots,
    compendium,
    combat,
    exploration,
  ] = await Promise.all([
    computePresence(deps.io, campaign.id),
    fetchHistoryPage(deps.ctx.prisma, campaign.id, user),
    // The full scene list is GM manager data — players never receive it.
    user.role === ROLE_GM
      ? fetchSceneList(deps.ctx.prisma, campaign.id)
      : Promise.resolve<SceneSummary[]>([]),
    // Already filtered per viewer: no hidden tokens, foreign HP, or anything
    // standing in unrevealed fog.
    viewedScene
      ? fetchSceneTokensFor(deps.ctx.prisma, deps.ctx.cpred, viewedScene, user)
      : Promise.resolve([]),
    // The mask is the same for everyone — it describes what is visible.
    viewedScene
      ? fetchFogState(deps.ctx.prisma, viewedScene)
      : Promise.resolve<FogState | null>(null),
    // Public drawings for everyone; the GM layer only for the GM.
    viewedSceneId
      ? fetchSceneDrawings(deps.ctx.prisma, viewedSceneId, user.role === ROLE_GM)
      : Promise.resolve<DrawingView[]>([]),
    // GM layer notes never reach a player socket.
    viewedSceneId && user.role === ROLE_GM
      ? fetchSceneNotes(deps.ctx.prisma, viewedSceneId)
      : Promise.resolve<MapNoteView[]>([]),
    // Walls are GM data, full stop — a player gets `vision` below instead,
    // which is what the walls produced rather than what they are.
    viewedSceneId && user.role === ROLE_GM
      ? fetchSceneWalls(deps.ctx.prisma, viewedSceneId)
      : Promise.resolve<WallView[]>([]),
    // Lights are GM data for the same reason walls are — the shape a lamp
    // throws is the shape of the room. Players get `vision.light` instead.
    viewedSceneId && user.role === ROLE_GM
      ? fetchSceneLights(deps.ctx.prisma, viewedSceneId)
      : Promise.resolve<LightView[]>([]),
    // Field of view of this player's own tokens; null in every other mode.
    viewedScene
      ? computeViewerVision(deps.ctx.prisma, viewedScene, user)
      : Promise.resolve<ViewerVision | null>(null),
    // GM: all campaign characters; player: only their own.
    fetchCharactersFor(deps.ctx.prisma, deps.ctx.cpred, campaign.id, user),
    // Bot profiles carry secrets and prompts — GM only.
    fetchBotsFor(deps.ctx.prisma, campaign.id, user.role === ROLE_GM),
    // Item catalogue: files on disk plus the campaign's own entries.
    buildCompendiumSync(deps, campaign.id),
    // Initiative tracker of the viewed scene — hidden participants are
    // stripped for players, exactly like hidden tokens.
    viewedSceneId ? fetchCombatFor(deps.ctx.prisma, viewedSceneId, user) : Promise.resolve(null),
    // The party's memory of this map (stage 18c) — the same for everyone,
    // because it holds only what somebody has already seen.
    explorationMaskFor(deps.ctx.prisma, viewedScene),
  ]);
  const scene: SceneView | null = viewedScene ? toSceneView(viewedScene) : null;
  return {
    seq: deps.seqs.current(campaignRoom(campaign.id)),
    campaign,
    presence,
    messages: history.messages,
    hasMoreHistory: history.hasMore,
    scene,
    scenes,
    tokens,
    fog,
    drawings,
    notes,
    walls,
    lights,
    vision: vision
      ? {
          sceneId: scene?.id ?? '',
          polygons: vision.polygons,
          light: vision.light,
          glows: vision.glows,
        }
      : null,
    openings: vision?.openings ?? [],
    exploration,
    characters,
    bots,
    ai: aiStatusFor(deps, user.role === ROLE_GM),
    compendium,
    combat,
  };
}

export async function sendStateSync(
  deps: RealtimeDeps,
  socket: Socket,
  user: SessionUser,
): Promise<void> {
  socket.emit('state:sync', await buildStateSync(deps, socket, user));
}

export const stateRequestEvent = defineEvent({
  name: 'state:request',
  handler: async ({ deps, socket, user }) => {
    await sendStateSync(deps, socket, user);
  },
});
