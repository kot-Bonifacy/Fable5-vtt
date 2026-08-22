import type { Socket } from 'socket.io';
import type { CampaignSummary, SessionUser } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { getActiveCampaign } from '../routes/helpers.js';
import { defineEvent, RealtimeError, type RealtimeDeps } from './registry.js';
import { campaignRoom, gmRoom } from './state.js';
import { broadcastPresence } from './presence.js';
import { joinInitialScene, switchViewedScene } from './scenes.js';
import { sendStateSync } from './sync.js';

export interface CampaignActivatePayload {
  campaignId?: unknown;
}

/**
 * The campaign a user's socket should join: the active campaign for the GM,
 * and for a player — only if they are a member of it.
 */
export async function resolveSocketCampaign(
  prisma: PrismaClient,
  user: SessionUser,
): Promise<CampaignSummary | null> {
  const campaign = await getActiveCampaign(prisma);
  if (!campaign) return null;
  if (user.role === ROLE_GM) return campaign;
  const membership = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId: campaign.id, userId: user.id } },
  });
  return membership ? campaign : null;
}

/**
 * Re-homes one already connected socket after the active campaign changed:
 * out of the old rooms, into the new ones, and a full `state:sync` on top.
 *
 * The same three steps a fresh socket takes on connect, in the same order —
 * that is the point. Everything a client shows (scene, tokens, chat, tracker,
 * sheets, compendium) arrives in that one payload, so re-running it is a
 * complete change of world without a page reload.
 */
async function rehomeSocket(deps: RealtimeDeps, socket: Socket): Promise<string | null> {
  const user = socket.data.user as SessionUser;
  const previous = (socket.data.campaign as CampaignSummary | null) ?? null;
  if (previous) {
    await socket.leave(campaignRoom(previous.id));
    await socket.leave(gmRoom(previous.id));
  }
  // Leaves the scene room and clears `viewedSceneId`; the new campaign's own
  // active scene is picked below. Without this the socket would keep listening
  // to a scene belonging to a campaign it is no longer in.
  await switchViewedScene(socket, null);

  const campaign = await resolveSocketCampaign(deps.ctx.prisma, user);
  socket.data.campaign = campaign;
  if (campaign) {
    await socket.join(campaignRoom(campaign.id));
    if (user.role === ROLE_GM) await socket.join(gmRoom(campaign.id));
    await joinInitialScene(deps, socket, campaign.id);
  }
  await sendStateSync(deps, socket, user);
  // The header name lives in the auth store, which is fed by REST — the client
  // re-reads it when this lands. A player who is not a member of the new
  // campaign gets `null` and the same „no campaign" screen as before login.
  socket.emit('campaign:switch', { campaign });
  return previous?.id ?? null;
}

/**
 * Makes one campaign the active one and moves every connected socket with it.
 *
 * Until the repair session of 22.08 the switch changed a row in the database
 * and nothing else: the map, the chat header, the initiative tracker and the
 * action bar all kept serving the previous campaign until somebody pressed F5.
 * The GM could act on a scene whose campaign the header no longer named — bug
 * #1 of the 08.08 combat session.
 */
export async function activateCampaign(deps: RealtimeDeps, campaignId: string): Promise<void> {
  const campaign = await deps.ctx.prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new RealtimeError('NOT_FOUND');

  // Single active campaign at a time (stage 02) — the same transaction the
  // creation route runs, so „create" and „activate" cannot disagree.
  await deps.ctx.prisma.$transaction(async (tx) => {
    await tx.campaign.updateMany({ where: { active: true }, data: { active: false } });
    await tx.campaign.update({ where: { id: campaignId }, data: { active: true } });
  });

  const abandoned = new Set<string>();
  for (const socket of deps.io.sockets.sockets.values()) {
    try {
      const previous = await rehomeSocket(deps, socket);
      if (previous && previous !== campaignId) abandoned.add(previous);
    } catch (error) {
      deps.log.error({ err: error, socketId: socket.id }, 'campaign switch failed for socket');
    }
  }
  // Presence is per campaign: the one everybody left has to hear about it too,
  // or its list keeps naming people who are no longer there.
  for (const id of [campaignId, ...abandoned]) await broadcastPresence(deps, id);
}

export const campaignActivateEvent = defineEvent<CampaignActivatePayload>({
  name: 'campaign:activate',
  role: ROLE_GM,
  handler: async ({ deps, payload }) => {
    const campaignId = typeof payload?.campaignId === 'string' ? payload.campaignId.trim() : '';
    if (campaignId.length === 0) throw new RealtimeError('BAD_REQUEST');
    await activateCampaign(deps, campaignId);
  },
});
