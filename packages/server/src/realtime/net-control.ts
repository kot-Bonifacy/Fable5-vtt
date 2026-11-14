import type { NetDeviceKind, SessionUser } from '@vtt/shared';
import {
  NET_DEVICE_KIND_LABELS,
  ROLE_GM,
  netDeviceStateOf,
  readNetRunState,
  readNetRuntime,
  validateNetArchitecture,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';

/**
 * Pożyczona kontrola (etap 70b) — figury urządzeń, które netrunner prowadzi,
 * dopóki trzyma ich węzeł kontrolny. Uogólnia pożyczony wzrok kamer z 20.10:
 * kamera jest tu jednym z rodzajów.
 *
 * **Uprawnienie to dalej węzeł, nie własność żetonu** (umowa 26d):
 * `Token.ownerId` się nie zmienia, a każda ścieżka, która pyta „czy to konto
 * może ruszyć tę figurę przez Sieć”, pyta `operatorOf` — osobne warunki
 * w ataku, ruchu i widoku rozjechałyby się przy pierwszej poprawce.
 *
 * Moduł czyta wyłącznie bazę i czyste funkcje z `@vtt/shared`: woła go
 * `vision.ts` (przez `net-cameras.ts`) i `tokens.ts` przy każdym liczeniu
 * widoku, więc zależność od `netrun-io.ts` zrobiłaby z tego pętlę.
 *
 * Cztery warunki wpisu:
 *  - węzeł jest w `controlled` runu („po przejęciu kontroli nad węzłem”,
 *    s. 199) — odłączenie kasuje run, więc i kontrolę;
 *  - urządzenie ma figurę na mapie (`tokenId`);
 *  - jest włączone — „Wyłącz” oddaje figurę (włącza się ją z okna SIEĆ);
 *  - strefa obronna za nim nie jest rozbrojona na miejscu (66e, pkt 27).
 */
export interface NetDeviceGrant {
  tokenId: string;
  runId: string;
  architectureId: string;
  floorId: string;
  /** Etykieta węzła z Architektury — „przez: Obrona”. */
  nodeLabel: string;
  deviceId: string;
  deviceKind: NetDeviceKind;
  /** Nazwa urządzenia z edytora Architektury (jej zawartość). */
  deviceName: string;
  /** Wpis systemu obronnego urządzenia, gdy MG go wybrał. */
  entryId: string | null;
  /** Figura netrunnera — to jej tura i jej Akcje Sieciowe płacą. */
  runnerTokenId: string;
  runnerSceneId: string;
  characterId: string;
  /**
   * Konta, które prowadzą: właściciel figury albo karty runu. Puste przy
   * NPC-netrunnerze MG — figura jest wtedy przejęta (tura pominięta, straż
   * milczy), ale żaden gracz jej nie prowadzi.
   */
  operatorIds: Set<string>;
}

/** Figura urządzenia → kto i przez co ją trzyma. */
export async function loadNetDeviceGrants(
  prisma: PrismaClient,
  campaignId: string,
): Promise<Map<string, NetDeviceGrant>> {
  const runs = await prisma.netRun.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      data: true,
      tokenId: true,
      characterId: true,
      architecture: {
        select: { id: true, name: true, difficulty: true, data: true, runtime: true },
      },
      token: {
        select: { sceneId: true, ownerId: true, character: { select: { ownerId: true } } },
      },
    },
  });
  const grants = new Map<string, NetDeviceGrant>();
  const disarmedByArchitecture = new Map<string, Set<string>>();
  for (const run of runs) {
    const state = readNetRunState(run.data);
    if (!state || state.controlled.length === 0) continue;
    const architecture = parseArchitecture(run.architecture);
    if (!architecture) continue;
    const runtime = readNetRuntime(run.architecture.runtime);
    let disarmed = disarmedByArchitecture.get(run.architecture.id);
    if (!disarmed) {
      disarmed = await disarmedDevicesOf(prisma, run.architecture.id);
      disarmedByArchitecture.set(run.architecture.id, disarmed);
    }
    const operatorIds = new Set(
      [run.token.ownerId, run.token.character?.ownerId].filter(
        (id): id is string => typeof id === 'string',
      ),
    );
    const held = new Set(state.controlled.map((hold) => hold.floorId));
    for (const floor of architecture.branches.flatMap((branch) => branch.floors)) {
      if (!held.has(floor.id)) continue;
      for (const device of floor.devices ?? []) {
        if (!device.tokenId || grants.has(device.tokenId)) continue;
        if (!netDeviceStateOf(runtime.devices, device.id).on) continue;
        if (disarmed.has(device.id)) continue;
        grants.set(device.tokenId, {
          tokenId: device.tokenId,
          runId: run.id,
          architectureId: run.architecture.id,
          floorId: floor.id,
          nodeLabel: floor.label || 'Węzeł kontrolny',
          deviceId: device.id,
          deviceKind: device.deviceKind,
          deviceName: device.name || NET_DEVICE_KIND_LABELS[device.deviceKind],
          entryId: device.entryId ?? null,
          runnerTokenId: run.tokenId,
          runnerSceneId: run.token.sceneId,
          characterId: run.characterId,
          operatorIds,
        });
      }
    }
  }
  return grants;
}

/** Urządzenia, za którymi stoi strefa rozbrojona na mapie (`armed = false`). */
async function disarmedDevicesOf(prisma: PrismaClient, architectureId: string) {
  const rows = await prisma.defenseZone.findMany({
    where: { architectureId, armed: false, deviceId: { not: null } },
    select: { deviceId: true },
  });
  return new Set(rows.flatMap((row) => (row.deviceId ? [row.deviceId] : [])));
}

/**
 * Czy to konto prowadzi tę figurę przez węzeł — **jedyne** pytanie o prawo do
 * przejętej figury. MG nie jest operatorem: prowadzi każdą figurę z urzędu,
 * zwykłą drogą i bez Akcji Sieciowych.
 */
export async function operatorOf(
  prisma: PrismaClient,
  campaignId: string,
  tokenId: unknown,
  user: SessionUser,
): Promise<NetDeviceGrant | null> {
  if (user.role === ROLE_GM || typeof tokenId !== 'string' || tokenId.length === 0) return null;
  const grant = (await loadNetDeviceGrants(prisma, campaignId)).get(tokenId);
  return grant?.operatorIds.has(user.id) ? grant : null;
}

/** Figury, które to konto prowadzi przez swoje węzły — dla widoku listy figur. */
export async function operatedTokenIdsOf(
  prisma: PrismaClient,
  campaignId: string,
  userId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const grant of (await loadNetDeviceGrants(prisma, campaignId)).values()) {
    if (grant.operatorIds.has(userId)) ids.add(grant.tokenId);
  }
  return ids;
}

/** Czy figura jest teraz w czyichś rękach w Sieci (tura pominięta, straż milczy). */
export async function seizedGrantOf(
  prisma: PrismaClient,
  campaignId: string,
  tokenId: string | null | undefined,
): Promise<NetDeviceGrant | null> {
  if (!tokenId) return null;
  return (await loadNetDeviceGrants(prisma, campaignId)).get(tokenId) ?? null;
}

/** Konta, które prowadzą tę figurę przez węzeł — puste, gdy nikt (70c: klatki marszu drona). */
export async function operatorIdsOf(
  prisma: PrismaClient,
  campaignId: string,
  tokenId: string,
): Promise<ReadonlySet<string>> {
  return (await loadNetDeviceGrants(prisma, campaignId)).get(tokenId)?.operatorIds ?? new Set();
}

/**
 * Figury urządzeń wyłączonych w Sieci (etap 70c) — stan urządzenia
 * w Architekturze, który przeżywa odłączenie („kamera wyłączona zostaje
 * wyłączona”, 26d). Dla naklejki „Wyłączony”, kolejki, straży i oczu.
 */
export async function loadNetSwitchedOffTokenIds(
  prisma: PrismaClient,
  campaignId: string,
): Promise<Set<string>> {
  const off = new Set<string>();
  const rows = await prisma.netArchitecture.findMany({
    where: { campaignId },
    select: { id: true, name: true, difficulty: true, data: true, runtime: true },
  });
  for (const row of rows) {
    const runtime = readNetRuntime(row.runtime);
    if ((runtime.devices ?? []).every((state) => state.on)) continue;
    const architecture = parseArchitecture(row);
    if (!architecture) continue;
    for (const floor of architecture.branches.flatMap((branch) => branch.floors)) {
      for (const device of floor.devices ?? []) {
        if (device.tokenId && !netDeviceStateOf(runtime.devices, device.id).on) {
          off.add(device.tokenId);
        }
      }
    }
  }
  return off;
}

/**
 * Gdzie figura jest urządzeniem Sieci (etap 70f) — każda Architektura kampanii
 * z id urządzeń wskazujących ten żeton. Przełącznik MG „Włącz / Wyłącz
 * w Sieci” pisze stan we wszystkich naraz: figura wpięta w dwie Sieci (wzorzec
 * i dopięta Sieć ze sceny) milczy, gdy wyłączy ją którakolwiek
 * (`loadNetSwitchedOffTokenIds`).
 */
export async function netDevicesOfToken(
  prisma: PrismaClient,
  campaignId: string,
  tokenId: string,
): Promise<{ architectureId: string; deviceIds: string[] }[]> {
  const rows = await prisma.netArchitecture.findMany({
    where: { campaignId, data: { contains: tokenId } },
    select: { id: true, name: true, difficulty: true, data: true },
  });
  const wired: { architectureId: string; deviceIds: string[] }[] = [];
  for (const row of rows) {
    const architecture = parseArchitecture(row);
    if (!architecture) continue;
    const deviceIds = architecture.branches
      .flatMap((branch) => branch.floors)
      .flatMap((floor) => floor.devices ?? [])
      .filter((device) => device.tokenId === tokenId)
      .map((device) => device.id);
    if (deviceIds.length > 0) wired.push({ architectureId: row.id, deviceIds });
  }
  return wired;
}

/** Dlaczego figura urządzenia milczy: przejęta w Sieci albo w niej wyłączona. */
export type NetSilence = 'seized' | 'off';

/**
 * Figury urządzeń, które nie działają same (70b, 70c): tury nie grają, obszar
 * straży nie strzela, nie patrzą na skradających się i nie zakładają walki
 * z zauważenia. Jedno pytanie dla kolejki, stref, skradania i walki z 56 —
 * pytany jest węzeł i stan urządzenia, nie naklejka.
 */
export async function netSilencedTokenIds(
  prisma: PrismaClient,
  campaignId: string,
): Promise<Map<string, NetSilence>> {
  const silenced = new Map<string, NetSilence>();
  for (const tokenId of await loadNetSwitchedOffTokenIds(prisma, campaignId)) {
    silenced.set(tokenId, 'off');
  }
  for (const tokenId of (await loadNetDeviceGrants(prisma, campaignId)).keys()) {
    silenced.set(tokenId, 'seized');
  }
  return silenced;
}

/** To samo dla jednej sceny — wołający z kolejki i walki z 56 znają tylko scenę. */
export async function netSilencedOnScene(
  prisma: PrismaClient,
  sceneId: string,
): Promise<Map<string, NetSilence>> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    select: { campaignId: true },
  });
  if (!scene) return new Map();
  const runs = await prisma.netRun.count({ where: { campaignId: scene.campaignId } });
  const architectures = await prisma.netArchitecture.count({
    where: { campaignId: scene.campaignId },
  });
  if (runs === 0 && architectures === 0) return new Map();
  return netSilencedTokenIds(prisma, scene.campaignId);
}

/**
 * Odcisk tego, kto co trzyma w kampanii — `emitRuns` porównuje go z poprzednim
 * i dopiero zmiana (węzeł przejęty, urządzenie wyłączone, run zakończony)
 * przelicza widok graczy i naklejki figur. Od 70c obejmuje też figury
 * wyłączone w Sieci (naklejka „Wyłączony”).
 */
export function netGrantSignature(
  grants: ReadonlyMap<string, NetDeviceGrant>,
  switchedOff: ReadonlySet<string> = new Set(),
): string {
  const held = [...grants.values()]
    .map((grant) => `${grant.tokenId}:${grant.runId}:${[...grant.operatorIds].sort().join(',')}`)
    .sort()
    .join('|');
  return `${held}#${[...switchedOff].sort().join(',')}`;
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
