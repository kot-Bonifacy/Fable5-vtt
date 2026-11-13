import { NET_CAMERA_CONE_DEG } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene } from '../generated/prisma/client.js';
import type { BorrowedSight } from './vision.js';
import { loadNetDeviceGrants } from './net-control.js';

/**
 * Kamery przejęte w Sieci (zlecenie MG z 20.10) — wzrok, który netrunner
 * pożycza od figury kamery, dopóki trzyma jej węzeł kontrolny.
 *
 * Moduł czyta wyłącznie bazę i czyste funkcje z `@vtt/shared`, bo woła go
 * `vision.ts` przy każdym liczeniu widoku: zależność od `netrun-io.ts` (który
 * sam sięga do widzenia) zrobiłaby z tego pętlę.
 *
 * Trzy warunki, wszystkie z podręcznika i z decyzji MG:
 *  - węzeł jest w `controlled` runu („po przejęciu kontroli nad węzłem",
 *    s. 199) — odłączenie kasuje run, więc i wzrok;
 *  - kamera jest włączona (`netCameraSees`) — wyłączona nic nie pokazuje;
 *  - patrzy **tylko netrunner** (decyzja MG z 20.10): właściciel figury albo
 *    karty runu. NPC-netrunner MG nikomu wzroku nie pożycza.
 */

/**
 * Figura kamery → konta, które przez nią patrzą. Od etapu 70b to wycinek
 * pożyczonej kontroli (`loadNetDeviceGrants`): kamera jest jednym z rodzajów
 * przejętych figur, a warunki — węzeł w `controlled`, urządzenie włączone —
 * sprawdza tamten moduł.
 */
export async function loadNetCameraGrants(
  prisma: PrismaClient,
  campaignId: string,
): Promise<Map<string, Set<string>>> {
  const grants = new Map<string, Set<string>>();
  for (const grant of (await loadNetDeviceGrants(prisma, campaignId)).values()) {
    if (grant.deviceKind !== 'camera' || grant.operatorIds.size === 0) continue;
    grants.set(grant.tokenId, new Set(grant.operatorIds));
  }
  return grants;
}

/** Przejęte kamery stojące na tej scenie, z kontami, które przez nie patrzą. */
export async function loadNetCameraSights(
  prisma: PrismaClient,
  scene: Pick<Scene, 'id' | 'campaignId'>,
): Promise<BorrowedSight[]> {
  const grants = await loadNetCameraGrants(prisma, scene.campaignId);
  if (grants.size === 0) return [];
  const tokens = await prisma.token.findMany({
    where: { sceneId: scene.id, id: { in: [...grants.keys()] } },
  });
  return tokens.map((token) => ({
    token,
    viewers: grants.get(token.id) ?? new Set<string>(),
    coneDeg: NET_CAMERA_CONE_DEG,
  }));
}

/**
 * Odcisk tego, kto przez co patrzy w kampanii — `emitRuns` porównuje go
 * z poprzednim i dopiero zmiana (węzeł przejęty, kamera wyłączona, run
 * zakończony) przelicza widok graczy. Kierunek kamery tu nie wchodzi: obrót
 * figury przelicza widok drogą każdej innej zmiany figury.
 */
export function netCameraSignature(grants: ReadonlyMap<string, ReadonlySet<string>>): string {
  return [...grants.entries()]
    .map(([tokenId, viewers]) => `${tokenId}:${[...viewers].sort().join(',')}`)
    .sort()
    .join('|');
}
