import {
  NET_CAMERA_CONE_DEG,
  netCameraSees,
  netDeviceStateOf,
  readNetRunState,
  readNetRuntime,
  validateNetArchitecture,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene } from '../generated/prisma/client.js';
import type { BorrowedSight } from './vision.js';

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

/** Figura kamery → konta, które przez nią patrzą. */
export async function loadNetCameraGrants(
  prisma: PrismaClient,
  campaignId: string,
): Promise<Map<string, Set<string>>> {
  const runs = await prisma.netRun.findMany({
    where: { campaignId },
    select: {
      data: true,
      architecture: {
        select: { id: true, name: true, difficulty: true, data: true, runtime: true },
      },
      token: { select: { ownerId: true, character: { select: { ownerId: true } } } },
    },
  });
  const grants = new Map<string, Set<string>>();
  for (const run of runs) {
    const viewers = [run.token.ownerId, run.token.character?.ownerId].filter(
      (id): id is string => typeof id === 'string',
    );
    if (viewers.length === 0) continue;
    const state = readNetRunState(run.data);
    if (!state || state.controlled.length === 0) continue;
    const architecture = parseArchitecture(run.architecture);
    if (!architecture) continue;
    const runtime = readNetRuntime(run.architecture.runtime);
    const held = new Set(state.controlled.map((hold) => hold.floorId));
    for (const floor of architecture.branches.flatMap((branch) => branch.floors)) {
      if (!held.has(floor.id)) continue;
      for (const device of floor.devices ?? []) {
        if (device.deviceKind !== 'camera' || !device.tokenId) continue;
        if (!netCameraSees(netDeviceStateOf(runtime.devices, device.id))) continue;
        const entry = grants.get(device.tokenId) ?? new Set<string>();
        for (const viewer of viewers) entry.add(viewer);
        grants.set(device.tokenId, entry);
      }
    }
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

function parseArchitecture(row: { id: string; name: string; difficulty: string; data: string }) {
  try {
    const parsed = validateNetArchitecture({
      ...JSON.parse(row.data),
      id: row.id,
      name: row.name,
      difficulty: row.difficulty,
    });
    return parsed.ok ? parsed.architecture : null;
  } catch {
    return null;
  }
}
