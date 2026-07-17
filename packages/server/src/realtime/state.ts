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

/** Socket.IO room of a campaign — every member and the GM join it. */
export function campaignRoom(campaignId: string): string {
  return `campaign:${campaignId}`;
}

/** Socket.IO room of a scene — joined by viewers of that scene (stage 04+). */
export function sceneRoom(sceneId: string): string {
  return `scene:${sceneId}`;
}
