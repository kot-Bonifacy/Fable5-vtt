import {
  CPRED_INTERFACE_PLUGS_NAME,
  cpredVehicleChase,
  hasRequiredCyberware,
  readCpredVehicle,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Token } from '../generated/prisma/client.js';
import type { SheetMoveBudget } from '../sheets.js';

/**
 * Budżet ruchu kierowcy w pościgu (etap 65c, s. 192 i decyzja MG 12).
 *
 * „Cecha Ruch pojazdu zastępuje Ruch tego kierowcy. Modyfikatory do Ruchu
 * kierowcy nie wpływają na Ruch pojazdu” i „Kierowca nie może używać Akcji
 * Biegu”. Zamiast osobnego licznika auto jedzie z **budżetu tury kierowcy**:
 * Akcja Ruchu kupuje `Ruch / 4` kratek (zasada domowa), więc rejestr,
 * odmowy, pytanie MG o przekroczenie i Nitro (drugi Ruch za Akcję) działają
 * tak samo jak przy marszu.
 *
 * Moduł-liść: woła go `moveBudgetForCombatant` w trackerze, a tracker nie może
 * importować `chase.ts` (ten importuje figury, figury — tracker).
 */
export async function drivingMoveBudget(
  prisma: PrismaClient,
  token: Pick<Token, 'sceneVehicleId' | 'vehicleSeat'>,
): Promise<SheetMoveBudget | null> {
  if (token.sceneVehicleId === null || token.vehicleSeat !== 0) return null;
  const placed = await prisma.sceneVehicle.findUnique({
    where: { id: token.sceneVehicleId },
    include: { vehicle: true, scene: true },
  });
  if (!placed || placed.scene.kind !== 'chase' || !placed.started) return null;
  if (placed.status !== 'racing') return null;
  const stats = readCpredVehicle(placed.vehicle.system);
  const chase = cpredVehicleChase(stats, {
    tempo: placed.scene.chaseTempo,
    started: true,
    nitroUsed: placed.nitroUsed,
  });
  if (chase.moveSq <= 0) return null;
  return {
    metresPerMove: chase.moveSq * placed.scene.metersPerSquare,
    note: `${placed.vehicle.name}: Ruch ${stats.move}`,
    noRun: true,
  };
}

/**
 * Czy figura trzyma kierownicę ręką (s. 191, etap 65c): siedzi za kierownicą
 * uruchomionego auta w kadrze i nie ma złącz interfejsu. Wtedy broń dwuręczna
 * odpada (`WHEEL_TWO_HANDED` w planie ataku).
 */
export async function drivesWithOneHand(
  prisma: PrismaClient,
  token: Pick<Token, 'sceneVehicleId' | 'vehicleSeat'>,
  cyberware: readonly string[],
): Promise<boolean> {
  if (token.sceneVehicleId === null || token.vehicleSeat !== 0) return false;
  if (hasRequiredCyberware([CPRED_INTERFACE_PLUGS_NAME], cyberware)) return false;
  const placed = await prisma.sceneVehicle.findUnique({
    where: { id: token.sceneVehicleId },
    select: { started: true, status: true },
  });
  return placed !== null && placed.started && placed.status === 'racing';
}
