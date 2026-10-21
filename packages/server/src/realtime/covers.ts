import { deferView } from './presentation.js';
import type {
  CoverClearPayload,
  CoverCreatePayload,
  CoverDeletePayload,
  CoverSyncBroadcast,
  CoverUpdatePayload,
  CoverView,
} from '@vtt/shared';
import {
  COVER_DEFAULT_NAME,
  COVER_GENERIC_TYPE,
  COVER_HP_MAX,
  COVER_MAX_PER_SCENE,
  ROLE_GM,
  coversForPlayers,
  sanitizeCoverHp,
  sanitizeCoverName,
  sanitizeCoverRect,
} from '@vtt/shared';
import type { Scene } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { fetchSceneCovers, toCoverView } from './covers-io.js';
import { requireCampaignScene } from './scenes.js';
import { campaignRoom, gmRoom, sceneRoom } from './state.js';
import { rememberDeletion, scalarRow } from './undo-buffer.js';

/**
 * Cover on the map (stage 16c) — core VTT storage.
 *
 * The geometry lives in `@vtt/shared` (`covers.ts`); this module stores it and
 * guards who may edit it. Since 21.10.2026 (zlecenie MG) a placement is one
 * generic „Osłona" with the body points the GM typed, instead of a preset read
 * out of the material catalogue — every event here is GM-only, so the number
 * coming over the wire is the GM's word, exactly like the card's PW field.
 *
 * Unlike walls and lights, the list goes to *everybody* — minus the covers the
 * GM hid, which a player's copy leaves out (see `covers-io.ts`).
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/**
 * Pushes the whole cover list of one scene to whoever is looking at it.
 *
 * A full list rather than deltas, for the reason the walls send one: a scene
 * holds tens of rows, covers change only while somebody is editing or shooting,
 * and a list that cannot desync is worth more than the bytes an upsert saves.
 */
export async function emitCovers(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Pick<Scene, 'id' | 'active'>,
): Promise<void> {
  if (deferView(deps, (ready) => emitCovers(ready, campaignId, scene))) return;
  const covers = await fetchSceneCovers(deps.ctx.prisma, scene.id);
  // The players' copy goes to the whole audience and the GM's full list right
  // after it to the GM room — the same pair `token:upsert` sends for a hidden
  // figure, so the GM ends on the copy that has the hidden covers in it.
  const publicPayload = {
    sceneId: scene.id,
    covers: coversForPlayers(covers),
  } satisfies CoverSyncBroadcast;
  if (!scene.active) {
    deps.io.to(sceneRoom(scene.id)).emit('cover:sync', publicPayload);
  } else {
    const room = campaignRoom(campaignId);
    deps.io.to(room).emit('cover:sync', { ...publicPayload, seq: deps.seqs.next(room) });
  }
  if (publicPayload.covers.length !== covers.length) {
    deps.io
      .to(gmRoom(campaignId))
      .emit('cover:sync', { sceneId: scene.id, covers } satisfies CoverSyncBroadcast);
  }
}

/** Loads a cover row and proves it belongs to this campaign. */
async function requireCampaignCover(deps: RealtimeDeps, campaignId: string, coverId: unknown) {
  if (typeof coverId !== 'number' || !Number.isInteger(coverId)) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const row = await deps.ctx.prisma.cover.findUnique({
    where: { id: coverId },
    include: { scene: true },
  });
  if (!row || row.scene.campaignId !== campaignId) throw new RealtimeError('COVER_NOT_FOUND');
  return row;
}

export const coverCreateEvent = defineEvent<CoverCreatePayload, CoverView>({
  name: 'cover:create',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    const rect = sanitizeCoverRect({
      x: payload?.x,
      y: payload?.y,
      width: payload?.width,
      height: payload?.height,
    });
    if (!rect) throw new RealtimeError('BAD_REQUEST');

    // „Jeśli nie może zatrzymać kuli, nie jest to osłona i nie ma PW" (s. 179):
    // zero body points is refused rather than stored as a wreck from birth.
    const hpMax = sanitizeCoverHp(payload?.hpMax);
    if (hpMax === null) throw new RealtimeError('COVER_HAS_NO_HP');
    if (payload?.hidden !== undefined && typeof payload.hidden !== 'boolean') {
      throw new RealtimeError('BAD_REQUEST');
    }

    const stored = await deps.ctx.prisma.cover.count({ where: { sceneId: scene.id } });
    if (stored >= COVER_MAX_PER_SCENE) throw new RealtimeError('COVER_LIMIT_REACHED');

    const created = await deps.ctx.prisma.cover.create({
      data: {
        sceneId: scene.id,
        typeId: COVER_GENERIC_TYPE,
        name: sanitizeCoverName(payload?.name) ?? COVER_DEFAULT_NAME,
        ...rect,
        hpMax,
        hpCurrent: hpMax,
        hidden: payload?.hidden === true,
      },
    });
    await emitCovers(deps, campaignId, scene);
    return toCoverView(created);
  },
});

export const coverUpdateEvent = defineEvent<CoverUpdatePayload, CoverView>({
  name: 'cover:update',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const row = await requireCampaignCover(deps, campaignId, payload?.coverId);
    const patch = payload?.patch;
    if (typeof patch !== 'object' || patch === null) throw new RealtimeError('BAD_REQUEST');

    const data: {
      name?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      hpCurrent?: number;
      hpMax?: number;
      hidden?: boolean;
    } = {};

    // Geometry is validated as a whole rectangle even when only one corner
    // moved: a patch that shrinks a car below the minimum size is the same
    // mis-drag whether it arrived in one field or four.
    if (
      patch.x !== undefined ||
      patch.y !== undefined ||
      patch.width !== undefined ||
      patch.height !== undefined
    ) {
      const rect = sanitizeCoverRect({
        x: patch.x ?? row.x,
        y: patch.y ?? row.y,
        width: patch.width ?? row.width,
        height: patch.height ?? row.height,
      });
      if (!rect) throw new RealtimeError('BAD_REQUEST');
      Object.assign(data, rect);
    }

    if (patch.hidden !== undefined) {
      if (typeof patch.hidden !== 'boolean') throw new RealtimeError('BAD_REQUEST');
      data.hidden = patch.hidden;
    }

    if (patch.name !== undefined) {
      const name = sanitizeCoverName(patch.name);
      if (!name) throw new RealtimeError('BAD_REQUEST');
      data.name = name;
    }

    // Wytrzymałość maksymalna (etap 27l). Idzie **przed** `hpCurrent`, bo to ono wyznacza
    // sufit dla bieżących PW w tym samym patchu — karta wysyła oba naraz.
    if (patch.hpMax !== undefined) {
      const hpMax = sanitizeCoverHp(patch.hpMax);
      if (hpMax === null) throw new RealtimeError('BAD_REQUEST');
      data.hpMax = hpMax;
      // Obniżone maksimum ściąga za sobą bieżące PW: osłona z „12/10" byłaby
      // wrakiem, który raportuje więcej życia, niż go ma.
      if (row.hpCurrent > hpMax) data.hpCurrent = hpMax;
    }

    // The GM's hand on the body points: dent one without shooting it, or weld a
    // wreck back together. Clamped rather than refused — a slider that stops at
    // the ends is what the caller means.
    if (patch.hpCurrent !== undefined) {
      if (typeof patch.hpCurrent !== 'number' || !Number.isInteger(patch.hpCurrent)) {
        throw new RealtimeError('BAD_REQUEST');
      }
      const ceiling = Math.min(data.hpMax ?? row.hpMax, COVER_HP_MAX);
      data.hpCurrent = Math.max(0, Math.min(patch.hpCurrent, ceiling));
    }

    if (Object.keys(data).length === 0) return toCoverView(row);
    const updated = await deps.ctx.prisma.cover.update({ where: { id: row.id }, data });
    await emitCovers(deps, campaignId, row.scene);
    return toCoverView(updated);
  },
});

export const coverDeleteEvent = defineEvent<CoverDeletePayload>({
  name: 'cover:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const row = await requireCampaignCover(deps, campaignId, payload?.coverId);
    rememberDeletion({
      campaignId,
      userId: user.id,
      sceneId: row.sceneId,
      kind: 'cover',
      rows: [scalarRow(row)],
    });
    await deps.ctx.prisma.cover.delete({ where: { id: row.id } });
    await emitCovers(deps, campaignId, row.scene);
  },
});

export const coverClearEvent = defineEvent<CoverClearPayload>({
  name: 'cover:clear',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);
    // Jedna pozycja cofania na cały kosz — zamyka zaległość „kosz osłon kasuje
    // bez pytania i bez cofnięcia" (etap 27k).
    const doomed = await deps.ctx.prisma.cover.findMany({ where: { sceneId: scene.id } });
    rememberDeletion({
      campaignId,
      userId: user.id,
      sceneId: scene.id,
      kind: 'cover',
      rows: doomed.map(scalarRow),
    });
    await deps.ctx.prisma.cover.deleteMany({ where: { sceneId: scene.id } });
    await emitCovers(deps, campaignId, scene);
  },
});
