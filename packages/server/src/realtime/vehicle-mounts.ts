import type {
  CpredCharacterData,
  CpredWeaponRow,
  ScenePoint,
  SceneVehicleView,
  VehicleMountReloadPayload,
} from '@vtt/shared';
import {
  CPRED_ACTION_RELOAD,
  ROLE_GM,
  cpredMountReloaded,
  cpredMountRowInfo,
  cpredMountWeaponRows,
  cpredParseMountRowId,
  cpredWithMountWeapons,
  isWeaponEntry,
  readCpredVehicle,
  resolveWeapon,
  vehicleSideFacing,
  type CpredMountRowInfo,
  type CpredMountWeaponLookup,
  type CpredVehicleStats,
} from '@vtt/shared';
import type { Token } from '../generated/prisma/client.js';
import { buildCompendiumSync } from './compendium.js';
import {
  chaseBodyOf,
  chaseGeometry,
  placedView,
  requireChaseCampaignId,
  requirePlaced,
  vehicleMoving,
} from './chase.js';
import { driverOf, requireOwnDriver } from './chase-driving.js';
import { findCombatantForToken } from './combat.js';
import { requireTurnSpend } from './combat-actions.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitVehicleUpsert } from './vehicles.js';

/**
 * Bronie pokładowe (etap 65d2, s. 163–164): karabin maszynowy, miotacz ognia,
 * wyrzutnia rakiet i broń biała z ulepszeń Moto. Nie leżą na karcie — wiersz
 * broni składa się z ulepszenia auta w chwili strzału (`cpredMountWeaponRows`)
 * i dokłada do listy kierowcy na czas planowania. Magazynek mieszka w aucie
 * (`Vehicle.system.mountAmmo`), więc strzela z niego każdy, kto siądzie za
 * kierownicą, a karta kierowcy zostaje nietknięta.
 *
 * Stanowisko bardzo ciężkiej broni nie ma tu nic do roboty: pasażer strzela
 * z niego własną bronią z karty i przeładowuje w jeździe, jak z każdego fotela.
 */

/** Kości, magazynek i LA broni z katalogu — tego potrzebuje wiersz pokładowy. */
async function mountLookup(
  deps: RealtimeDeps,
  campaignId: string,
): Promise<CpredMountWeaponLookup> {
  const compendium = await buildCompendiumSync(deps, campaignId);
  const weaponTypeById = new Map(compendium.weaponTypes.map((type) => [type.id, type]));
  return (entryId) => {
    const entry = compendium.entries.find((candidate) => candidate.id === entryId);
    if (!entry || !isWeaponEntry(entry)) return null;
    const resolved = resolveWeapon(entry, { weaponTypeById });
    return resolved
      ? { damage: resolved.damage, magazine: resolved.magazine, rof: resolved.rof }
      : null;
  };
}

/** Broń pokładowa, z której strzela kierowca, z autem i ulepszeniem. */
export interface MountedShot {
  row: CpredWeaponRow;
  info: CpredMountRowInfo;
  sceneVehicleId: string;
  stats: CpredVehicleStats;
}

/**
 * Wiersz broni pokładowej dla tego strzelca albo `null`, gdy id nie jest
 * pokładowe. Strzela wyłącznie kierowca tego auta (fotel 0) — „Kierowca może
 * go użyć, wykorzystując do tego Akcję”.
 */
export async function mountedShotFor(
  deps: RealtimeDeps,
  campaignId: string,
  attacker: Token,
  weaponRowId: unknown,
): Promise<MountedShot | null> {
  const parsed = cpredParseMountRowId(weaponRowId);
  if (!parsed) return null;
  const placed = await deps.ctx.prisma.sceneVehicle.findUnique({
    where: { vehicleId: parsed.vehicleId },
    include: { vehicle: true, scene: true },
  });
  if (!placed || placed.scene.campaignId !== campaignId) throw new RealtimeError('UNKNOWN_WEAPON');
  if (attacker.sceneVehicleId !== placed.id || attacker.vehicleSeat !== 0) {
    throw new RealtimeError('MOUNT_DRIVER_ONLY');
  }
  const stats = readCpredVehicle(placed.vehicle.system);
  const info = cpredMountRowInfo(placed.vehicleId, parsed.upgradeRowId, stats);
  const rows = cpredMountWeaponRows(placed.vehicleId, stats, await mountLookup(deps, campaignId));
  const row = rows.find((candidate) => candidate.id === weaponRowId);
  if (!info || !row) throw new RealtimeError('UNKNOWN_WEAPON');
  return { row, info, sceneVehicleId: placed.id, stats };
}

/**
 * Wiersz broni pokładowej do rzutu obrażeń za kartę ataku — strzelca sprawdziła
 * już karta (`requireAttackShooter`), więc tu bez pytania o fotel.
 */
export async function mountRowForDamage(
  deps: RealtimeDeps,
  campaignId: string,
  weaponRowId: unknown,
): Promise<CpredWeaponRow | null> {
  const parsed = cpredParseMountRowId(weaponRowId);
  if (!parsed) return null;
  const vehicle = await deps.ctx.prisma.vehicle.findUnique({ where: { id: parsed.vehicleId } });
  if (!vehicle || vehicle.campaignId !== campaignId) return null;
  const rows = cpredMountWeaponRows(
    vehicle.id,
    readCpredVehicle(vehicle.system),
    await mountLookup(deps, campaignId),
  );
  return rows.find((row) => row.id === weaponRowId) ?? null;
}

/** Lista broni kierowcy z tą jedną bronią pokładową — na czas planowania strzału. */
export function withMountedShot<T extends CpredCharacterData>(data: T, shot: MountedShot): T {
  return cpredWithMountWeapons(data, [shot.row]);
}

/**
 * Reguły ulepszenia, które planer broni nie zna: karabin maszynowy strzela
 * tylko Ogniem ciągłym, a karabin i rakiety — tylko w cele przed pojazdem.
 */
export async function requireMountedShotAllowed(
  deps: RealtimeDeps,
  shot: MountedShot,
  mode: unknown,
  aimPoint: ScenePoint,
): Promise<void> {
  if (shot.info.definition.autofireOnly && mode !== 'autofire') {
    throw new RealtimeError('MOUNT_AUTOFIRE_ONLY');
  }
  if (shot.info.definition.arc !== 'front') return;
  const placed = await deps.ctx.prisma.sceneVehicle.findUnique({
    where: { id: shot.sceneVehicleId },
    include: { vehicle: true, scene: true },
  });
  if (!placed) throw new RealtimeError('VEHICLE_NOT_FOUND');
  const { settings } = chaseGeometry(placed.scene);
  const side = vehicleSideFacing(
    { x: placed.x, y: placed.y },
    chaseBodyOf(placed.vehicle),
    settings.direction,
    aimPoint,
  );
  if (side !== 'front') throw new RealtimeError('MOUNT_FRONT_ONLY');
}

/** Naboje po strzale do magazynka w aucie — karta kierowcy zostaje nietknięta. */
export async function saveMountedAmmo(
  deps: RealtimeDeps,
  campaignId: string,
  shot: MountedShot,
  ammoAfter: number,
): Promise<void> {
  const fresh = await deps.ctx.prisma.vehicle.findUnique({
    where: { id: shot.info.vehicleId },
  });
  if (!fresh) return;
  const stats = readCpredVehicle(fresh.system);
  const system = {
    ...stats,
    mountAmmo: { ...stats.mountAmmo, [shot.info.upgradeRowId]: Math.max(0, ammoAfter) },
  };
  const saved = await deps.ctx.prisma.vehicle.update({
    where: { id: fresh.id },
    data: { system: JSON.stringify(system) },
  });
  await emitVehicleUpsert(deps, campaignId, saved);
}

/**
 * `vehicle:mount-reload` — „Nie da się załadować w czasie jazdy” (s. 163–164):
 * broń pokładową kierowca przeładowuje na postoju (silnik zgaszony albo droga
 * stoi), w walce za Akcję. Magazynek wraca pełny — naboje bez dna jak przy
 * broni z karty (zasada domowa z 23.10), rakiety pokładowe też.
 */
export const vehicleMountReloadEvent = defineEvent<VehicleMountReloadPayload, SceneVehicleView>({
  name: 'vehicle:mount-reload',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireChaseCampaignId(socket.data);
    const placed = await requirePlaced(deps.ctx.prisma, campaignId, payload?.sceneVehicleId);
    const stats = readCpredVehicle(placed.vehicle.system);
    const info =
      typeof payload?.upgradeRowId === 'string'
        ? cpredMountRowInfo(placed.vehicleId, payload.upgradeRowId, stats)
        : null;
    if (!info || info.definition.magazine === 0) throw new RealtimeError('UNKNOWN_WEAPON');
    const driver =
      user.role === ROLE_GM
        ? await driverOf(deps.ctx.prisma, placed.id)
        : await requireOwnDriver(deps.ctx.prisma, placed, user);
    if (!driver) throw new RealtimeError('NOT_DRIVER');
    if (vehicleMoving(placed, stats, placed.scene.chaseRunning)) {
      throw new RealtimeError('MOUNT_RELOAD_MOVING');
    }
    const row = cpredMountWeaponRows(
      placed.vehicleId,
      stats,
      await mountLookup(deps, campaignId),
    ).find((candidate) => candidate.id.endsWith(`:${info.upgradeRowId}`));
    if (!row) throw new RealtimeError('UNKNOWN_WEAPON');
    const found = await findCombatantForToken(deps.ctx.prisma, placed.sceneId, driver.id);
    if (found) {
      await requireTurnSpend(
        deps,
        campaignId,
        placed.scene,
        driver.id,
        { kind: 'action', actionId: CPRED_ACTION_RELOAD },
        user,
        CPRED_ACTION_RELOAD,
      );
    }
    const saved = await deps.ctx.prisma.vehicle.update({
      where: { id: placed.vehicleId },
      data: {
        system: JSON.stringify({
          ...stats,
          mountAmmo: cpredMountReloaded(stats, info.upgradeRowId, row.ammoMax),
        }),
      },
    });
    await emitVehicleUpsert(deps, campaignId, saved);
    return placedView(deps.ctx.prisma, placed.sceneId, placed.id);
  },
});
