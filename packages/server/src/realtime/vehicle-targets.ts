import type { AttackBlocked, ScenePoint, SessionUser } from '@vtt/shared';
import {
  ROLE_GM,
  VEHICLE_WINDOW_LABELS,
  chaseBodyNearestPoint,
  cpredEffectiveStats,
  cpredInterfaceLinkDodges,
  cpredVehicleWindows,
  cpredVehicleWrecked,
  isVehicleWindowSide,
  parseCharacterData,
  readCpredVehicle,
  vehicleSideFacing,
  type CpredAttackTarget,
  type VehicleWindowSide,
} from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import type { PrismaClient } from '../db.js';
import { chaseBodyOf, chaseGeometry, driverCapable, type PlacedVehicle } from './chase.js';
import { RealtimeError, type RealtimeDeps } from './registry.js';

/**
 * Auto jako cel ataku (etap 65d1, s. 191).
 *
 * Auto na scenie pościgu jest celem jak osłona z 16c — nie robi uników, nie ma
 * głowy — tylko z własną drogą obrażeń (OB kadłuba → PUK, `damage.ts`). Szyba
 * kuloodporna to druga rzecz z PW: stoi między strzelcem a pasażerem na burcie
 * zwróconej do strzelca i zatrzymuje strzał jak osłona (`windowBlockFor`).
 *
 * Ulepszone zespolenie (s. 165): kierowca motocykla ze złączem i REF 8+ unika
 * za motocykl i za pasażera — `evasionDefenderFor` mówi, czyj to Unik.
 */

export type TargetVehicle = PlacedVehicle & { scene: Scene };

/** Auto tej kampanii na scenie pościgu, które ten widz widzi. */
export async function requireTargetVehicle(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneVehicleId: unknown,
  window: unknown,
): Promise<{ placed: TargetVehicle; window: VehicleWindowSide | null }> {
  if (typeof sceneVehicleId !== 'string') throw new RealtimeError('BAD_REQUEST');
  if (window !== undefined && !isVehicleWindowSide(window)) throw new RealtimeError('BAD_REQUEST');
  const placed = await deps.ctx.prisma.sceneVehicle.findUnique({
    where: { id: sceneVehicleId },
    include: { vehicle: true, scene: true },
  });
  if (!placed || placed.scene.campaignId !== campaignId || placed.scene.kind !== 'chase') {
    throw new RealtimeError('VEHICLE_NOT_FOUND');
  }
  // Auto, które odpadło z pościgu, zniknęło graczom z kadru (65c) — ta sama
  // odpowiedź co dla auta, którego nie ma.
  if (user.role !== ROLE_GM && placed.status !== 'racing') {
    throw new RealtimeError('VEHICLE_NOT_FOUND');
  }
  if (window && !cpredVehicleWindows(readCpredVehicle(placed.vehicle.system))) {
    throw new RealtimeError('NO_BULLETPROOF_GLASS');
  }
  return { placed, window: window ?? null };
}

/** Punkt bryły najbliższy strzelca — tam celuje strzał w auto, stąd liczy się zasięg. */
export function vehicleAimPoint(placed: TargetVehicle, origin: ScenePoint): ScenePoint {
  const { settings } = chaseGeometry(placed.scene);
  return chaseBodyNearestPoint(
    placed,
    chaseBodyOf(placed.vehicle),
    settings.direction,
    placed.scene.gridSizePx,
    origin,
  );
}

/** Strona planera: nazwa, jedzie czy stoi, szyba. */
export function vehicleAttackTarget(
  placed: TargetVehicle,
  window: VehicleWindowSide | null,
  metres: number,
): CpredAttackTarget & { vehicleId: string; window?: VehicleWindowSide } {
  const stats = readCpredVehicle(placed.vehicle.system);
  // „Nieruchomy pojazd” (s. 191): stojąca droga, zgaszony silnik albo wrak.
  const moving = placed.scene.chaseRunning && placed.started && !cpredVehicleWrecked(stats);
  return {
    name: window
      ? `${placed.vehicle.name} — ${VEHICLE_WINDOW_LABELS[window]}`
      : placed.vehicle.name,
    vehicleId: placed.id,
    ...(window ? { window } : {}),
    metres,
    vehicle: { moving, ...(window ? { window: true } : {}) },
  };
}

/**
 * Szyba kuloodporna między strzelcem a figurą w aucie (s. 191 i 163): „Osoby
 * w pojeździe mogą stać się celem ataków przez szyby, które nie mają PW” —
 * a kuloodporne PW mają, więc są osłoną burty zwróconej do strzelca, dopóki
 * mają choć 1 PW. Strzelec w tym samym aucie żadnej szyby nie ma przed sobą.
 */
export async function windowBlockFor(
  prisma: PrismaClient,
  target: Token,
  attacker: Token,
  origin: ScenePoint,
): Promise<AttackBlocked | null> {
  if (target.sceneVehicleId === null) return null;
  if (attacker.sceneVehicleId === target.sceneVehicleId) return null;
  const placed = await prisma.sceneVehicle.findUnique({
    where: { id: target.sceneVehicleId },
    include: { vehicle: true, scene: true },
  });
  if (!placed || placed.scene.kind !== 'chase') return null;
  const windows = cpredVehicleWindows(readCpredVehicle(placed.vehicle.system));
  if (!windows) return null;
  const side = vehicleSideFacing(
    placed,
    chaseBodyOf(placed.vehicle),
    chaseGeometry(placed.scene).settings.direction,
    origin,
  );
  const pane = windows[side];
  if (pane.hp <= 0) return null;
  return {
    kind: 'window',
    sceneVehicleId: placed.id,
    side,
    name: `${placed.vehicle.name} — ${VEHICLE_WINDOW_LABELS[side]}`,
    hpCurrent: pane.hp,
    hpMax: pane.max,
  };
}

/**
 * Czyj Unik odpowiada na atak (s. 165): zwykle cel; auto bez zespolenia — nikt
 * („Pojazdy nie mogą unikać ataków”, s. 191); motocykl z Ulepszonym
 * zespoleniem i kierowcą ze złączem i REF 8+ — kierowca, za motocykl
 * i za pasażera. Kierowca, który leży, za nikogo nie unika.
 */
export async function evasionDefenderFor(
  deps: RealtimeDeps,
  campaignId: string,
  meta: { targetTokenId?: string | null; targetVehicleId?: string; targetWindow?: string },
): Promise<string | null> {
  const prisma = deps.ctx.prisma;
  let sceneVehicleId: string | null = null;
  if (meta.targetVehicleId !== undefined) {
    if (meta.targetWindow) return null;
    sceneVehicleId = meta.targetVehicleId;
  } else if (meta.targetTokenId) {
    const token = await prisma.token.findUnique({ where: { id: meta.targetTokenId } });
    if (!token) return null;
    if (token.sceneVehicleId === null || token.vehicleSeat === 0) return token.id;
    sceneVehicleId = token.sceneVehicleId;
  } else {
    return null;
  }
  const passenger = meta.targetVehicleId === undefined ? (meta.targetTokenId ?? null) : null;
  const linked = await linkedDriverOf(deps, campaignId, sceneVehicleId);
  return linked ?? passenger;
}

/** Kierowca motocykla z Ulepszonym zespoleniem, który może unikać za innych. */
async function linkedDriverOf(
  deps: RealtimeDeps,
  campaignId: string,
  sceneVehicleId: string,
): Promise<string | null> {
  const prisma = deps.ctx.prisma;
  const placed = await prisma.sceneVehicle.findUnique({
    where: { id: sceneVehicleId },
    include: { vehicle: true },
  });
  if (!placed) return null;
  const stats = readCpredVehicle(placed.vehicle.system);
  if (stats.kind !== 'motorcycle') return null;
  const driver = await prisma.token.findFirst({ where: { sceneVehicleId, vehicleSeat: 0 } });
  if (!driver?.characterId || !driverCapable(driver)) return null;
  const character = await prisma.character.findUnique({ where: { id: driver.characterId } });
  if (!character || character.campaignId !== campaignId) return null;
  const data = parseCharacterData(character.data, deps.ctx.cpred);
  return cpredInterfaceLinkDodges(stats, {
    ref: cpredEffectiveStats(data).ref,
    cyberware: data.cyberware.map((piece) => piece.name),
  })
    ? driver.id
    : null;
}
