import type { Server as SocketIOServer } from 'socket.io';
import type { SessionUser } from '@vtt/shared';

/**
 * Per-room sequence counters (in memory). Room-wide broadcasts carry
 * consecutive numbers; a gap on the client means a missed event and triggers
 * a full resync. Counters reset on server restart — clients always receive a
 * fresh `state:sync` on (re)connect, so they never compare across restarts.
 */
export class RoomSequences {
  private readonly counters = new Map<string, number>();

  next(room: string): number {
    const value = (this.counters.get(room) ?? 0) + 1;
    this.counters.set(room, value);
    return value;
  }

  current(room: string): number {
    return this.counters.get(room) ?? 0;
  }
}

/**
 * Socket.IO room of a campaign's **table** — the GM always (preparation or
 * session), players only while a session runs (stage 44c). Every room-wide
 * broadcast of the game goes here, so nothing of the GM's preparation reaches
 * a player between sessions.
 */
export function campaignRoom(campaignId: string): string {
  return `campaign:${campaignId}`;
}

/**
 * Players of a campaign **between sessions** (stage 44c): they read their
 * sheets, journal, handouts and chat, but sit at no table. Nothing is
 * broadcast to this room as a whole — it exists so that deliveries addressed
 * to one player (their sheet, a handout, a whisper) still find them, and so
 * that „Rozpocznij sesję" knows whom to seat.
 */
export function lobbyRoom(campaignId: string): string {
  return `campaign:${campaignId}:lobby`;
}

/**
 * Every socket of a campaign, at the table or between sessions — for
 * deliveries addressed to particular users (stage 44c). A room-wide broadcast
 * uses `campaignRoom` alone.
 */
export function campaignMemberSockets(io: SocketIOServer, campaignId: string) {
  return io.in([campaignRoom(campaignId), lobbyRoom(campaignId)]).fetchSockets();
}

/** Socket.IO room of a scene — joined by viewers of that scene. */
export function sceneRoom(sceneId: string): string {
  return `scene:${sceneId}`;
}

/** GM-only room of a campaign — targeted GM data (scene lists) goes here. */
export function gmRoom(campaignId: string): string {
  return `campaign:${campaignId}:gm`;
}

/** Emits to every socket of one user in a campaign (the whisper pattern) — at the table or not. */
export async function emitToCampaignUser(
  io: SocketIOServer,
  campaignId: string,
  userId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const sockets = await campaignMemberSockets(io, campaignId);
  for (const socket of sockets) {
    if ((socket.data as { user: SessionUser }).user.id === userId) {
      socket.emit(event, payload);
    }
  }
}
