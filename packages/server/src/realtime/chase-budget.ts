import { CPRED_INTERFACE_PLUGS_NAME, hasRequiredCyberware } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Token } from '../generated/prisma/client.js';
import type { SheetMoveBudget } from '../sheets.js';

/**
 * Budżet ruchu kierowcy w pościgu (etap 65c, od 72d bez metrów).
 *
 * „Cecha Ruch pojazdu zastępuje Ruch tego kierowcy” i „Kierowca nie może używać
 * Akcji Biegu” (s. 192). Od etapu 72 auto jedzie prędkością (`vehicle:drive`),
 * a Akcja Ruchu kierowcy to tylko żeton „gaz, hamulec albo pas” — tura nie
 * liczy metrów (`metresPerMove: 0` daje budżet w całych Akcjach Ruchu, jak
 * statysta bez karty), więc belka nie pokazuje paska dystansu, a Bieg odpada.
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
  return { metresPerMove: 0, note: null, noRun: true };
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
