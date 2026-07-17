import type { Server as SocketIOServer } from 'socket.io';
import type { PresenceBroadcast, PresenceEntry, SessionUser } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import type { RealtimeDeps } from './registry.js';
import { campaignRoom } from './state.js';

/** Lists online users in a campaign room, GM first, deduplicated across tabs. */
export async function computePresence(
  io: SocketIOServer,
  campaignId: string,
): Promise<PresenceEntry[]> {
  const sockets = await io.in(campaignRoom(campaignId)).fetchSockets();
  const byUserId = new Map<string, PresenceEntry>();
  for (const socket of sockets) {
    const user = (socket.data as { user: SessionUser }).user;
    byUserId.set(user.id, { userId: user.id, name: user.name, role: user.role });
  }
  return [...byUserId.values()].sort((a, b) => {
    if (a.role !== b.role) return a.role === ROLE_GM ? -1 : 1;
    return a.name.localeCompare(b.name, 'pl');
  });
}

/** Broadcasts the full presence list to the campaign room (with a new seq). */
export async function broadcastPresence(deps: RealtimeDeps, campaignId: string): Promise<void> {
  const room = campaignRoom(campaignId);
  const presence = await computePresence(deps.io, campaignId);
  const payload: PresenceBroadcast = { seq: deps.seqs.next(room), presence };
  deps.io.to(room).emit('presence:update', payload);
}
