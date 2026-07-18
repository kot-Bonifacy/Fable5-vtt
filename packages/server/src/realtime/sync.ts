import type { Socket } from 'socket.io';
import type { SceneSummary, SceneView, SessionUser, StateSyncPayload } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import { defineEvent, type RealtimeDeps } from './registry.js';
import { computePresence } from './presence.js';
import { fetchHistoryPage } from './chat.js';
import { fetchSceneList, getSceneById, toSceneView } from './scenes.js';
import { fetchSceneTokensFor } from './tokens.js';
import { fetchCharactersFor } from './characters.js';
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
      characters: [],
    };
  }
  const viewedSceneId = socket.data.viewedSceneId;
  const [presence, history, viewedScene, scenes, tokens, characters] = await Promise.all([
    computePresence(deps.io, campaign.id),
    fetchHistoryPage(deps.ctx.prisma, campaign.id, user),
    viewedSceneId ? getSceneById(deps.ctx.prisma, viewedSceneId) : Promise.resolve(null),
    // The full scene list is GM manager data — players never receive it.
    user.role === ROLE_GM
      ? fetchSceneList(deps.ctx.prisma, campaign.id)
      : Promise.resolve<SceneSummary[]>([]),
    // Already filtered per viewer: no hidden tokens or foreign HP for players.
    viewedSceneId ? fetchSceneTokensFor(deps.ctx.prisma, viewedSceneId, user) : Promise.resolve([]),
    // GM: all campaign characters; player: only their own.
    fetchCharactersFor(deps.ctx.prisma, deps.ctx.cpred, campaign.id, user),
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
    characters,
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
