import type { Socket } from 'socket.io';
import type { SessionUser, StateSyncPayload } from '@vtt/shared';
import { defineEvent, type RealtimeDeps } from './registry.js';
import { computePresence } from './presence.js';
import { fetchHistoryPage } from './chat.js';
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
    return { seq: 0, campaign: null, presence: [], messages: [], hasMoreHistory: false };
  }
  const [presence, history] = await Promise.all([
    computePresence(deps.io, campaign.id),
    fetchHistoryPage(deps.ctx.prisma, campaign.id, user.id),
  ]);
  return {
    seq: deps.seqs.current(campaignRoom(campaign.id)),
    campaign,
    presence,
    messages: history.messages,
    hasMoreHistory: history.hasMore,
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
