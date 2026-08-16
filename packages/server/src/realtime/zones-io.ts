import type { DefenseZoneView, SessionUser } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { DefenseZone as ZoneRow } from '../generated/prisma/client.js';
import { campaignRoom } from './state.js';
import type { RealtimeDeps } from './registry.js';

/**
 * Reading defended zones (stage 26f).
 *
 * Split out of `zones.ts` for the reason `covers-io.ts` and `netrun-io.ts`
 * were: the movement hook, the end-of-turn hook and the state sync all need
 * „what is armed on this scene?" without importing the event handlers, and the
 * handlers need to push a fresh list after every change without importing
 * themselves back.
 *
 * Unlike the covers and like the access points, the list is **cut per viewer**.
 * A trap nobody has noticed is absent from a player's payload rather than
 * flagged in it — that is what „Percepcja PT 17, by zauważyć" (s. 216) buys, and
 * a client that already had the row could draw it whatever the flag said.
 */

/** Who has already met this zone: accounts that saw it, characters that failed. */
export interface ZoneSightings {
  /** Account ids whose owner has spotted it (or whom the GM revealed it to). */
  users: string[];
  /**
   * Characters that already rolled Perception against it and failed.
   *
   * Without this list a player could re-roll by stepping one metre back and
   * forward again, which would turn „Percepcja PT 17" into „Percepcja, aż w
   * końcu wyjdzie". One roll per character per zone; the GM's reveal button is
   * the way past a bad one.
   */
  tried: string[];
}

export function readZoneSightings(raw: string | null | undefined): ZoneSightings {
  if (typeof raw !== 'string' || raw.length === 0) return { users: [], tried: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { users: [], tried: [] };
    const value = parsed as { users?: unknown; tried?: unknown };
    const list = (input: unknown): string[] =>
      Array.isArray(input) ? input.filter((id): id is string => typeof id === 'string') : [];
    return { users: list(value.users), tried: list(value.tried) };
  } catch {
    return { users: [], tried: [] };
  }
}

export function writeZoneSightings(sightings: ZoneSightings): string {
  return JSON.stringify({
    users: [...new Set(sightings.users)],
    tried: [...new Set(sightings.tried)],
  });
}

/** The pass list stored on a zone; a malformed column means „nobody". */
export function readZoneExempt(raw: string | null | undefined): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * One row as one viewer receives it.
 *
 * The GM's copy carries everything: the pass list, the control node, the note
 * and the figure that shoots for it — all of that is a *plan*, which is GM
 * data by the same rule that keeps a floor's note off a player's screen (26a).
 * A player gets the rectangle, the name and whether it is armed, because those
 * are what somebody standing in the room can see once they have noticed it.
 */
export function toZoneView(row: ZoneRow, gm: boolean, spotted: boolean): DefenseZoneView {
  return {
    id: row.id,
    sceneId: row.sceneId,
    entryId: row.entryId,
    name: row.name,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    armed: row.armed,
    hidden: row.hidden,
    hpMax: row.hpMax,
    hpCurrent: row.hpCurrent,
    ...(gm ? { exempt: readZoneExempt(row.exempt) } : {}),
    ...(gm && row.tokenId ? { tokenId: row.tokenId } : {}),
    ...(gm ? { architectureId: row.architectureId } : {}),
    ...(gm && row.floorId ? { floorId: row.floorId } : {}),
    ...(gm && row.deviceId ? { deviceId: row.deviceId } : {}),
    ...(gm && row.notes ? { notes: row.notes } : {}),
    ...(!gm && spotted ? { spotted: true } : {}),
  };
}

/** Every zone on a scene, unfiltered — for the server's own hooks. */
export async function fetchSceneZones(prisma: PrismaClient, sceneId: string): Promise<ZoneRow[]> {
  return prisma.defenseZone.findMany({ where: { sceneId }, orderBy: { id: 'asc' } });
}

/**
 * The zones of one scene, cut for one pair of eyes.
 *
 * The filter is a `where` clause plus one membership test rather than a flag on
 * the payload: a hidden zone the viewer has not spotted never becomes a row at
 * all, which is the difference between „the client will not draw it" and „the
 * client cannot draw it".
 */
export async function fetchZonesFor(
  prisma: PrismaClient,
  sceneId: string,
  user: SessionUser,
): Promise<DefenseZoneView[]> {
  const rows = await fetchSceneZones(prisma, sceneId);
  if (user.role === ROLE_GM) return rows.map((row) => toZoneView(row, true, false));
  const views: DefenseZoneView[] = [];
  for (const row of rows) {
    if (!row.hidden) {
      views.push(toZoneView(row, false, false));
      continue;
    }
    if (readZoneSightings(row.sightings).users.includes(user.id)) {
      views.push(toZoneView(row, false, true));
    }
  }
  return views;
}

/** Pushes the zone list of one scene to everybody looking at that scene. */
export async function emitZones(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string,
): Promise<void> {
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  for (const member of sockets) {
    const data = member.data as { user: SessionUser; viewedSceneId: string | null };
    if (data.viewedSceneId !== sceneId) continue;
    const zones = await fetchZonesFor(deps.ctx.prisma, sceneId, data.user);
    member.emit('zone:sync', { sceneId, zones });
  }
}
