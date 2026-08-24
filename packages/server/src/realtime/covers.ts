import type {
  CoverClearPayload,
  CoverCreatePayload,
  CoverDeletePayload,
  CoverSyncBroadcast,
  CoverUpdatePayload,
  CoverView,
} from '@vtt/shared';
import {
  COVER_HP_MAX,
  COVER_MAX_PER_SCENE,
  ROLE_GM,
  cpredCoverPreset,
  cpredCoverPresetHp,
  sanitizeCoverName,
  sanitizeCoverRect,
} from '@vtt/shared';
import type { Scene } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { fetchSceneCovers, toCoverView } from './covers-io.js';
import { requireCampaignScene } from './scenes.js';
import { campaignRoom, sceneRoom } from './state.js';
import { rememberDeletion, scalarRow } from './undo-buffer.js';

/**
 * Cover on the map (stage 16c) — core VTT storage, with one CP RED lookup.
 *
 * The geometry lives in `@vtt/shared` (`covers.ts`); this module stores it,
 * guards who may edit it, and does the one thing a client must never be trusted
 * with: **reading the body points out of the catalogue**. A placement names a
 * preset („samochód") and nothing else — if `hpMax` came over the wire, a
 * bulletproof crate would be one edited packet away.
 *
 * Unlike walls and lights, the finished list goes to *everybody*. A car in the
 * street is not a secret (see `covers-io.ts`), which is also why this file has
 * no GM-room branch at all: the audience is „whoever is looking at this scene",
 * sequenced campaign-wide on the active scene and targeted at the scene room
 * when the GM is dressing a map nobody else is on.
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
  const covers = await fetchSceneCovers(deps.ctx.prisma, scene.id);
  const payload = { sceneId: scene.id, covers } satisfies CoverSyncBroadcast;
  if (!scene.active) {
    deps.io.to(sceneRoom(scene.id)).emit('cover:sync', payload);
    return;
  }
  const room = campaignRoom(campaignId);
  deps.io.to(room).emit('cover:sync', { ...payload, seq: deps.seqs.next(room) });
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

    const preset =
      typeof payload?.typeId === 'string'
        ? cpredCoverPreset(deps.ctx.covers, payload.typeId)
        : null;
    if (!preset) throw new RealtimeError('UNKNOWN_COVER_TYPE');
    const hpMax = cpredCoverPresetHp(deps.ctx.covers, preset.id);
    // „Jeśli nie może zatrzymać kuli, nie jest to osłona i nie ma PW" (s. 179).
    // The plasterboard row of the table comes out at 0 for a reason, and the
    // honest answer to „place a partition wall as cover" is to refuse it.
    if (hpMax <= 0) throw new RealtimeError('COVER_HAS_NO_HP');

    const stored = await deps.ctx.prisma.cover.count({ where: { sceneId: scene.id } });
    if (stored >= COVER_MAX_PER_SCENE) throw new RealtimeError('COVER_LIMIT_REACHED');

    const created = await deps.ctx.prisma.cover.create({
      data: {
        sceneId: scene.id,
        typeId: preset.id,
        name: sanitizeCoverName(payload?.name) ?? preset.name,
        ...rect,
        hpMax,
        hpCurrent: hpMax,
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
      typeId?: string;
      name?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      hpCurrent?: number;
      hpMax?: number;
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

    // Zmiana presetu (etap 27l). Wytrzymałość czyta **serwer** z katalogu, tak
    // samo jak przy stawianiu: klient nie ma jak wpisać samochodowi własnych PW.
    if (patch.typeId !== undefined) {
      const preset =
        typeof patch.typeId === 'string' ? cpredCoverPreset(deps.ctx.covers, patch.typeId) : null;
      if (!preset) throw new RealtimeError('UNKNOWN_COVER_TYPE');
      const hpMax = cpredCoverPresetHp(deps.ctx.covers, preset.id);
      if (hpMax <= 0) throw new RealtimeError('COVER_HAS_NO_HP');
      data.typeId = preset.id;
      data.hpMax = hpMax;
      if (row.hpCurrent > hpMax) data.hpCurrent = hpMax;
      // Nazwa idzie za presetem tylko wtedy, gdy nikt jej nie zmieniał: osłona
      // nazwana „Radiowóz" ma tak zostać, ale „Samochód" przerobiony na słupek
      // nie może dalej nazywać się samochodem.
      const previous = cpredCoverPreset(deps.ctx.covers, row.typeId);
      if (previous && row.name === previous.name) data.name = preset.name;
    }

    if (patch.name !== undefined) {
      const name = sanitizeCoverName(patch.name);
      if (!name) throw new RealtimeError('BAD_REQUEST');
      data.name = name;
    }

    // Wytrzymałość maksymalna (etap 27l): preset z katalogu jest punktem
    // wyjścia, nie wyrokiem. Idzie **przed** `hpCurrent`, bo to ono wyznacza
    // sufit dla bieżących PW w tym samym patchu — karta wysyła oba naraz.
    if (patch.hpMax !== undefined) {
      if (
        typeof patch.hpMax !== 'number' ||
        !Number.isInteger(patch.hpMax) ||
        patch.hpMax < 1 ||
        patch.hpMax > COVER_HP_MAX
      ) {
        throw new RealtimeError('BAD_REQUEST');
      }
      data.hpMax = patch.hpMax;
      // Obniżone maksimum ściąga za sobą bieżące PW: osłona z „12/10" byłaby
      // wrakiem, który raportuje więcej życia, niż go ma.
      if (row.hpCurrent > patch.hpMax) data.hpCurrent = patch.hpMax;
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
