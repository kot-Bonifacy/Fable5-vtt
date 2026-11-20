import {
  chaseRacePending,
  sceneVehicleOffstage,
  type ChaseRaceLogEntry,
  type ChaseRaceWaitView,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene, Token } from '../generated/prisma/client.js';

/**
 * Załoga auta poza pościgiem (66c) — liść bez zależności od `tokens.ts`
 * i `chase.ts`, bo pytają o nią widok figur, wykrycie wroga i start walki.
 *
 * Auto `behind` / `escaped` gracz traci z oczu (`fetchSceneVehiclesFor`), więc
 * figury w jego fotelach też nie mogą do niego jechać: gracz widziałby ich
 * nazwy, a na aucie w rezerwie ze wzorca — figury stojące w kadrze.
 */

/** Id aut sceny, które są poza pościgiem. */
export async function offstageVehicleIds(
  prisma: PrismaClient,
  sceneId: string,
): Promise<Set<string>> {
  const rows = await prisma.sceneVehicle.findMany({
    where: { sceneId },
    select: { id: true, status: true },
  });
  return new Set(rows.filter((row) => sceneVehicleOffstage(row.status)).map((row) => row.id));
}

/** Czy figura siedzi w aucie poza pościgiem. */
export async function seatedOffstage(
  prisma: PrismaClient,
  token: Pick<Token, 'sceneVehicleId'>,
): Promise<boolean> {
  if (token.sceneVehicleId === null) return false;
  const row = await prisma.sceneVehicle.findUnique({
    where: { id: token.sceneVehicleId },
    select: { status: true },
  });
  return row !== null && sceneVehicleOffstage(row.status);
}

/**
 * Walka na scenie pościgu się zaczęła albo skończyła: prędkości, ruchy rundy,
 * zryw i stan rundy wracają do zera — poza walką prędkość to tylko zapowiedź
 * startowej (`cpredStartSpeed`), a bieżnia jedzie jak przed etapem 72.
 */
export async function resetChaseCombat(prisma: PrismaClient, sceneId: string): Promise<void> {
  await prisma.sceneVehicle.updateMany({
    where: { sceneId },
    data: { speed: 0, movedRound: 0, raceBonus: 0, lostControl: false },
  });
  await prisma.scene.updateMany({
    where: { id: sceneId, kind: 'chase' },
    data: { chasePursuitSpeed: null, chaseRace: null },
  });
}

// ───────── Wyścig rundy (etap 72c) — stan w `Scene.chaseRace`, czytany też przez widok sceny ─────────

/** Wyścig zapisany w `Scene.chaseRace` — karta czatu i to, czy runda na niego czeka. */
export interface StoredRace extends ChaseRaceLogEntry {
  messageId: number;
  /** Runda stoi bez tury i rusza po ostatnim rzucie. */
  paused: boolean;
}

export interface StoredRaceState {
  round: number;
  race?: StoredRace;
}

export function readRaceState(scene: Pick<Scene, 'chaseRace'>): StoredRaceState | null {
  if (!scene.chaseRace) return null;
  try {
    const parsed = JSON.parse(scene.chaseRace) as Partial<StoredRaceState>;
    if (typeof parsed.round !== 'number') return null;
    return parsed as StoredRaceState;
  } catch {
    return null;
  }
}

/** Wyścig sceny, który czeka na kubki — do widoku sceny (pas inicjatywy). */
export function chaseRaceWaitView(scene: Pick<Scene, 'chaseRace'>): ChaseRaceWaitView | null {
  const race = readRaceState(scene)?.race;
  if (!race || race.status !== 'waiting') return null;
  return {
    round: race.round,
    messageId: race.messageId,
    waitingFor: chaseRacePending(race).map((row) => row.driverName || row.vehicleName),
  };
}

/** Czy runda tej sceny stoi na Wyścigu (odmowa „Cofnij”, „Następna tura” = pomiń). */
export function chaseRacePaused(scene: Pick<Scene, 'chaseRace'>): boolean {
  const race = readRaceState(scene)?.race;
  return race !== undefined && race.status === 'waiting' && race.paused;
}
