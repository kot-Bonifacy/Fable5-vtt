import type { Server as SocketIOServer } from 'socket.io';
import type { PresenceBroadcast, PresenceEntry, SessionUser } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import type { RealtimeDeps } from './registry.js';
import { campaignRoom, lobbyRoom } from './state.js';

/**
 * Lists online users of a campaign, GM first, deduplicated across tabs. Since
 * stage 44c it names the players waiting between sessions too (`atTable:
 * false`) — the GM sees who is in before pressing „Rozpocznij sesję".
 */
export async function computePresence(
  io: SocketIOServer,
  campaignId: string,
): Promise<PresenceEntry[]> {
  const [table, lobby] = await Promise.all([
    io.in(campaignRoom(campaignId)).fetchSockets(),
    io.in(lobbyRoom(campaignId)).fetchSockets(),
  ]);
  const byUserId = new Map<string, PresenceEntry>();
  for (const [sockets, atTable] of [
    [lobby, false],
    [table, true],
  ] as const) {
    for (const socket of sockets) {
      const user = (socket.data as { user: SessionUser }).user;
      // A seat at the table wins over a tab still waiting outside.
      byUserId.set(user.id, { userId: user.id, name: user.name, role: user.role, atTable });
    }
  }
  return [...byUserId.values()].sort((a, b) => {
    if (a.role !== b.role) return a.role === ROLE_GM ? -1 : 1;
    return a.name.localeCompare(b.name, 'pl');
  });
}

/** Broadcasts the full presence list to the campaign's table (with a new seq). */
export async function broadcastPresence(deps: RealtimeDeps, campaignId: string): Promise<void> {
  const room = campaignRoom(campaignId);
  const presence = await computePresence(deps.io, campaignId);
  const payload: PresenceBroadcast = { seq: deps.seqs.next(room), presence };
  deps.io.to(room).emit('presence:update', payload);
}
