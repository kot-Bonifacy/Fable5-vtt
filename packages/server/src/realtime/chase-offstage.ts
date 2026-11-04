import { sceneVehicleOffstage } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Token } from '../generated/prisma/client.js';

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
