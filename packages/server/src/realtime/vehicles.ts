import type {
  SessionUser,
  VehicleCreatePayload,
  VehicleDeleteBroadcast,
  VehicleIdPayload,
  VehicleRenamePayload,
  VehicleUpdatePayload,
  VehicleUpsertBroadcast,
  VehicleView,
} from '@vtt/shared';
import {
  ROLE_GM,
  cpredVehicleFromCatalog,
  cpredVehicleIsModel,
  cpredVehiclePatch,
  isVehicleArtUrl,
  isVehicleEntry,
  isVehicleLayoutId,
  readCpredVehicle,
  readVehicleName,
  readVehicleSize,
} from '@vtt/shared';
import { requireOwnUploadUrl } from '../campaign-uploads.js';
import type { PrismaClient } from '../db.js';
import type { Vehicle } from '../generated/prisma/client.js';
import { createVehicle, toVehicleView, vehicleBodyColumns } from '../vehicles.js';
import { refreshChaseScenes, refreshVehiclePlacement } from './chase.js';
import { campaignEntry } from './compendium.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitToCampaignUser, gmRoom } from './state.js';

/**
 * Pojazdy kampanii (etap 65a): MG zakłada je z katalogu i zmienia wszystko,
 * właściciel karty zmienia nazwę i grafikę. Widoczność jak kart: MG widzi
 * każdy pojazd, gracz — pojazdy swoich kart. Każda wysyłka celowana, bez seq
 * pokoju (wzór kart z `character-io.ts`).
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

export async function fetchVehiclesFor(
  prisma: PrismaClient,
  campaignId: string,
  user: SessionUser,
): Promise<VehicleView[]> {
  const rows = await prisma.vehicle.findMany({
    where: {
      campaignId,
      ...(user.role === ROLE_GM ? {} : { owner: { ownerId: user.id } }),
    },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toVehicleView);
}

async function ownerUserOf(
  prisma: PrismaClient,
  characterId: string | null,
): Promise<string | null> {
  if (!characterId) return null;
  const row = await prisma.character.findUnique({
    where: { id: characterId },
    select: { ownerId: true },
  });
  return row?.ownerId ?? null;
}

/** Pojazd do MG i do gracza, którego karta go ma; `formerUserId` — komu zniknął. */
export async function emitVehicleUpsert(
  deps: RealtimeDeps,
  campaignId: string,
  row: Vehicle,
  formerUserId: string | null = null,
): Promise<void> {
  const payload: VehicleUpsertBroadcast = { vehicle: toVehicleView(row) };
  deps.io.to(gmRoom(campaignId)).emit('vehicle:upsert', payload);
  const userId = await ownerUserOf(deps.ctx.prisma, row.ownerCharacterId);
  if (userId) await emitToCampaignUser(deps.io, campaignId, userId, 'vehicle:upsert', payload);
  if (formerUserId && formerUserId !== userId) {
    await emitVehicleGone(deps, campaignId, row.id, formerUserId, false);
  }
  // Auto na scenie pościgu (65b) idzie za pojazdem: nazwa, grafika, bryła, fotele.
  await refreshVehiclePlacement(deps, campaignId, row.id);
}

export async function emitVehicleGone(
  deps: RealtimeDeps,
  campaignId: string,
  vehicleId: string,
  userId: string | null,
  toGm = true,
): Promise<void> {
  const payload: VehicleDeleteBroadcast = { vehicleId };
  if (toGm) deps.io.to(gmRoom(campaignId)).emit('vehicle:delete', payload);
  if (userId) await emitToCampaignUser(deps.io, campaignId, userId, 'vehicle:delete', payload);
  // Skasowany pojazd zszedł ze sceny pościgu kaskadą (65b) — `toGm` znaczy,
  // że zniknął naprawdę, a nie tylko z oczu dawnego właściciela.
  if (toGm) await refreshChaseScenes(deps, campaignId);
}

/**
 * Karta zmieniła gracza albo zniknęła: jej pojazdy idą za nią. `formerUserId`
 * traci je z widoku, nowy właściciel (i MG) dostaje je od nowa.
 */
export async function reseatCharacterVehicles(
  deps: RealtimeDeps,
  campaignId: string,
  vehicleIds: readonly string[],
  formerUserId: string | null,
): Promise<void> {
  if (vehicleIds.length === 0) return;
  const rows = await deps.ctx.prisma.vehicle.findMany({ where: { id: { in: [...vehicleIds] } } });
  for (const row of rows) await emitVehicleUpsert(deps, campaignId, row, formerUserId);
}

async function requireVehicle(
  prisma: PrismaClient,
  campaignId: string,
  vehicleId: unknown,
): Promise<Vehicle> {
  if (typeof vehicleId !== 'string' || vehicleId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const row = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!row || row.campaignId !== campaignId) throw new RealtimeError('VEHICLE_NOT_FOUND');
  return row;
}

async function requireOwnerCharacter(
  prisma: PrismaClient,
  campaignId: string,
  characterId: unknown,
): Promise<string | null> {
  if (characterId === null || characterId === undefined) return null;
  if (typeof characterId !== 'string') throw new RealtimeError('BAD_REQUEST');
  const row = await prisma.character.findUnique({
    where: { id: characterId },
    select: { campaignId: true },
  });
  if (!row || row.campaignId !== campaignId) throw new RealtimeError('CHARACTER_NOT_FOUND');
  return characterId;
}

export const vehicleCreateEvent = defineEvent<VehicleCreatePayload, VehicleView>({
  name: 'vehicle:create',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (typeof payload?.catalogId !== 'string') throw new RealtimeError('BAD_REQUEST');
    const entry = await campaignEntry(deps, campaignId, payload.catalogId);
    if (!entry || !isVehicleEntry(entry)) throw new RealtimeError('VEHICLE_NOT_IN_CATALOG');
    const ownerCharacterId = await requireOwnerCharacter(
      deps.ctx.prisma,
      campaignId,
      payload.ownerCharacterId,
    );
    const name = readVehicleName(payload.name) ?? entry.name;
    const row = await createVehicle(
      deps.ctx.prisma,
      campaignId,
      ownerCharacterId,
      name,
      cpredVehicleFromCatalog(entry),
      entry.art ?? null,
    );
    await emitVehicleUpsert(deps, campaignId, row);
    return toVehicleView(row);
  },
});

export const vehicleUpdateEvent = defineEvent<VehicleUpdatePayload, VehicleView>({
  name: 'vehicle:update',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const current = await requireVehicle(deps.ctx.prisma, campaignId, payload?.vehicleId);
    const patch = payload?.patch;
    if (typeof patch !== 'object' || patch === null) throw new RealtimeError('BAD_REQUEST');
    const data: Partial<Vehicle> = {};

    if ('name' in patch) {
      const name = readVehicleName(patch.name);
      if (!name) throw new RealtimeError('BAD_REQUEST');
      data.name = name;
    }
    if ('imageUrl' in patch) {
      if (patch.imageUrl !== null && typeof patch.imageUrl !== 'string') {
        throw new RealtimeError('BAD_REQUEST');
      }
      if (typeof patch.imageUrl === 'string' && !isVehicleArtUrl(patch.imageUrl)) {
        requireOwnUploadUrl(patch.imageUrl, campaignId);
      }
      data.imageUrl = patch.imageUrl;
    }
    for (const field of ['widthSq', 'lengthSq'] as const) {
      if (!(field in patch)) continue;
      const size = readVehicleSize(patch[field]);
      if (size === null) throw new RealtimeError('BAD_REQUEST');
      data[field] = size;
    }
    if ('layout' in patch) {
      if (!isVehicleLayoutId(patch.layout)) throw new RealtimeError('BAD_REQUEST');
      data.layout = patch.layout;
    }
    if ('ownerCharacterId' in patch) {
      const owner = await requireOwnerCharacter(
        deps.ctx.prisma,
        campaignId,
        patch.ownerCharacterId,
      );
      // Pojazd Taboru jest wierszem karty Nomady — oddać go innej karcie to
      // zostawić wiersz bez pojazdu. Najpierw z Taboru, potem dalej.
      if (owner !== current.ownerCharacterId && readCpredVehicle(current.system).fleetRowId) {
        throw new RealtimeError('VEHICLE_IN_FLEET');
      }
      data.ownerCharacterId = owner;
    }
    if ('system' in patch) {
      const result = cpredVehiclePatch(readCpredVehicle(current.system), patch.system);
      if (!result.ok) throw new RealtimeError(result.code);
      data.system = JSON.stringify(result.stats);
      // Fotele z ulepszeń zmieniają układ i bryłę, chyba że MG zmienił je
      // w tej samej łacie sam. Okno pojazdu wysyła układ i rozmiar zawsze —
      // wartość równa obecnej to „nie ruszałem”, nie decyzja MG (inaczej
      // Ulepszenie foteli z okna nigdy nie dokładało foteli na mapie).
      const body = vehicleBodyColumns(result.stats);
      const before = readCpredVehicle(current.system);
      const seatsChanged =
        before.seats !== result.stats.seats ||
        JSON.stringify(before.upgrades) !== JSON.stringify(result.stats.upgrades);
      if (seatsChanged) {
        const layoutChosen = 'layout' in patch && patch.layout !== current.layout;
        const sizeChosen =
          ('widthSq' in patch && patch.widthSq !== current.widthSq) ||
          ('lengthSq' in patch && patch.lengthSq !== current.lengthSq);
        if (!layoutChosen) data.layout = body.layout;
        if (!sizeChosen && body.layout !== current.layout) {
          data.widthSq = body.widthSq;
          data.lengthSq = body.lengthSq;
        }
      }
    }

    const formerUserId =
      'ownerCharacterId' in data
        ? await ownerUserOf(deps.ctx.prisma, current.ownerCharacterId)
        : null;
    const row = await deps.ctx.prisma.vehicle.update({ where: { id: current.id }, data });
    await emitVehicleUpsert(deps, campaignId, row, formerUserId);
    return toVehicleView(row);
  },
});

export const vehicleDeleteEvent = defineEvent<VehicleIdPayload, void>({
  name: 'vehicle:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const current = await requireVehicle(deps.ctx.prisma, campaignId, payload?.vehicleId);
    if (readCpredVehicle(current.system).fleetRowId) throw new RealtimeError('VEHICLE_IN_FLEET');
    const userId = await ownerUserOf(deps.ctx.prisma, current.ownerCharacterId);
    await deps.ctx.prisma.vehicle.delete({ where: { id: current.id } });
    await emitVehicleGone(deps, campaignId, current.id, userId);
  },
});

/**
 * Gracz nazywa swój pojazd i wybiera mu grafikę — tylko wbudowaną
 * (`isVehicleArtUrl`): wgrywa wyłącznie MG, a jego biblioteki gracz nie dostaje.
 */
export const vehicleRenameEvent = defineEvent<VehicleRenamePayload, VehicleView>({
  name: 'vehicle:rename',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const current = await requireVehicle(deps.ctx.prisma, campaignId, payload?.vehicleId);
    if (user.role !== ROLE_GM) {
      const ownerUser = await ownerUserOf(deps.ctx.prisma, current.ownerCharacterId);
      if (ownerUser !== user.id) throw new RealtimeError('VEHICLE_NOT_FOUND');
    }
    const data: Partial<Vehicle> = {};
    if (payload && 'name' in payload) {
      const name = readVehicleName(payload.name);
      if (!name) throw new RealtimeError('BAD_REQUEST');
      data.name = name;
    }
    if (payload && 'imageUrl' in payload) {
      if (payload.imageUrl !== null && !isVehicleArtUrl(payload.imageUrl)) {
        throw new RealtimeError('FORBIDDEN');
      }
      // Etap 67 (MG 06.11): „wygląd = model” — kupione auto ma wygląd modelu
      // i gracz go nie zmienia; MG tak (okno pojazdu, `vehicle:update`).
      if (user.role !== ROLE_GM) {
        const catalogId = readCpredVehicle(current.system).catalogId;
        const entry = catalogId ? await campaignEntry(deps, campaignId, catalogId) : undefined;
        if (cpredVehicleIsModel(entry)) throw new RealtimeError('VEHICLE_LOOK_LOCKED');
      }
      data.imageUrl = payload.imageUrl ?? null;
    }
    if (Object.keys(data).length === 0) return toVehicleView(current);
    const row = await deps.ctx.prisma.vehicle.update({ where: { id: current.id }, data });
    await emitVehicleUpsert(deps, campaignId, row);
    return toVehicleView(row);
  },
});
