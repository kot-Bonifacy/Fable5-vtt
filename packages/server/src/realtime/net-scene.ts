/**
 * Sieć ze sceny (etap 62, zlecenie MG z 28.10): figury z ikoną urządzenia same
 * są urządzeniami Sieci. Woła to `netrun:start`, po wszystkich odmowach —
 * podłączenie, które się nie udało, niczego w Architekturach nie zmienia —
 * a figurę postawioną w trakcie runu dopina `adoptSceneDeviceLive` (29.10).
 *
 * Od 70d Sieć ze sceny ma węzły wg rodzaju („Monitoring”, „Obrona”,
 * „Instalacje”), a do „Instalacji” trafiają też strefy środowiskowe sceny
 * (bez „Poza Siecią”) i drzwi „Sterowane z Sieci”. Strefa i drzwi dochodzą
 * same tylko do Architektury złożonej ze sceny — w Architekturze MG wiąże je
 * pole „Węzeł kontrolny” karty strefy (#33) i urządzenie „Drzwi” edytora.
 */
import {
  NET_DEVICE_KIND_BY_GLYPH,
  NET_SCENE_CONTROL_DV,
  isNetDefenseEntry,
  isOpening,
  isWallKind,
  netAdoptSceneDevices,
  netDifficultyDv,
  netHasDevice,
  netIsSceneArchitecture,
  netReleaseSceneDevice,
  netSceneArchitecture,
  netSceneZoneDeviceId,
  netWiredTokenIds,
  netWiredWallIds,
  netrunningDataOf,
  sanitizeTokenGlyph,
  type CpredNetArchitecture,
  type NetSceneDoor,
  type NetSceneFigure,
  type NetSceneParts,
  type NetSceneZone,
  type WallKind,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { RealtimeError, type RealtimeDeps } from './registry.js';
import { architectureOf, emitAccessPoints, emitRuns } from './netrun-io.js';
import { emitList } from './netrunning.js';
import { buildCompendiumSync } from './compendium.js';

async function sceneFigures(prisma: PrismaClient, sceneId: string): Promise<NetSceneFigure[]> {
  const rows = await prisma.token.findMany({
    where: { sceneId, glyph: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, glyph: true },
  });
  return rows.map((row) => ({
    tokenId: row.id,
    name: row.name,
    glyph: sanitizeTokenGlyph(row.glyph) ?? null,
  }));
}

/** Architektura kampanii razem z id wiersza — strefa wskazuje ją po id. */
interface StoredArchitecture {
  rowId: string;
  architecture: CpredNetArchitecture;
}

async function campaignArchitectures(
  prisma: PrismaClient,
  campaignId: string,
): Promise<StoredArchitecture[]> {
  const rows = await prisma.netArchitecture.findMany({
    where: { campaignId },
    select: { id: true, name: true, difficulty: true, data: true },
  });
  const stored: StoredArchitecture[] = [];
  for (const row of rows) {
    const architecture = architectureOf(row);
    if (architecture) stored.push({ rowId: row.id, architecture });
  }
  return stored;
}

/**
 * Strefy środowiskowe sceny, których nie wiąże jeszcze żadne istniejące
 * urządzenie (70d). Strefa związana z urządzeniem skasowanej Architektury
 * (MG skasował „Sieć: scena”) liczy się jako wolna i dochodzi od nowa.
 */
async function freeSceneZones(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string,
  stored: readonly StoredArchitecture[],
): Promise<NetSceneZone[]> {
  const rows = await deps.ctx.prisma.defenseZone.findMany({
    where: { sceneId, netExcluded: false },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      entryId: true,
      architectureId: true,
      floorId: true,
      deviceId: true,
    },
  });
  if (rows.length === 0) return [];
  const { entries } = await buildCompendiumSync(deps, campaignId);
  const zones: NetSceneZone[] = [];
  for (const row of rows) {
    const entry = entries.find((candidate) => candidate.id === row.entryId);
    if (!entry || !isNetDefenseEntry(entry) || entry.defenseKind !== 'environment') continue;
    const bound = stored.find((item) => item.rowId === row.architectureId);
    if (bound && netHasDevice(bound.architecture, row.floorId, row.deviceId)) continue;
    zones.push({ zoneId: row.id, name: row.name });
  }
  return zones;
}

const OPENING_NAMES: Partial<Record<WallKind, string>> = {
  door: 'Drzwi',
  window: 'Okno',
  gate: 'Brama',
};

/**
 * Drzwi, okna i bramy „Sterowane z Sieci” tej sceny (70d). Nazwa to rodzaj,
 * a przy kilku tego samego rodzaju — z numerem w kolejności rysowania, żeby
 * netrunner w pasku urządzeń wiedział, które otwiera.
 */
async function sceneDoors(prisma: PrismaClient, sceneId: string): Promise<NetSceneDoor[]> {
  const rows = await prisma.wall.findMany({
    where: { sceneId, netControlled: true },
    orderBy: { id: 'asc' },
    select: { id: true, kind: true },
  });
  const openings = rows.filter((row) => isWallKind(row.kind) && isOpening({ kind: row.kind }));
  const counts = new Map<string, number>();
  for (const row of openings) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  const seen = new Map<string, number>();
  return openings.map((row) => {
    const base = OPENING_NAMES[row.kind as WallKind] ?? 'Drzwi';
    const n = (seen.get(row.kind) ?? 0) + 1;
    seen.set(row.kind, n);
    return { wallId: row.id, name: (counts.get(row.kind) ?? 0) > 1 ? `${base} ${n}` : base };
  });
}

/** Wszystko ze sceny, co może dojść do tej Architektury. */
async function partsFor(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string,
  stored: readonly StoredArchitecture[],
  sceneBuilt: boolean,
): Promise<NetSceneParts> {
  const figures = await sceneFigures(deps.ctx.prisma, sceneId);
  if (!sceneBuilt) return { figures };
  return {
    figures,
    zones: await freeSceneZones(deps, campaignId, sceneId, stored),
    doors: await sceneDoors(deps.ctx.prisma, sceneId),
  };
}

/** Architektury nie zapisują własnego id — kluczem jest wiersz (jak `net:save`). */
const storedData = (architecture: CpredNetArchitecture) =>
  JSON.stringify({ ...architecture, id: undefined });

/** Piętro, na którym stoi urządzenie o tym id. */
function floorOfDevice(architecture: CpredNetArchitecture, deviceId: string): string | null {
  for (const branch of architecture.branches) {
    for (const floor of branch.floors) {
      if (floor.devices?.some((device) => device.id === deviceId)) return floor.id;
    }
  }
  return null;
}

/**
 * Strefy, które właśnie weszły do Architektury, dostają wiązanie #33 —
 * `zoneDisarmedByNetrunner` i okienko strefy czytają je stamtąd.
 */
async function bindZones(
  prisma: PrismaClient,
  architectureId: string,
  architecture: CpredNetArchitecture,
  zones: readonly NetSceneZone[],
): Promise<void> {
  for (const zone of zones) {
    const deviceId = netSceneZoneDeviceId(zone.zoneId);
    const floorId = floorOfDevice(architecture, deviceId);
    if (!floorId) continue;
    await prisma.defenseZone.update({
      where: { id: zone.zoneId },
      data: { architectureId, floorId, deviceId },
    });
  }
}

/**
 * Architektura, do której prowadzi gniazdo, z dopiętymi urządzeniami sceny.
 * Gniazdo bez Architektury dostaje prostą Sieć ze sceny i zostaje do niej
 * podpięte na stałe — MG zobaczy ją w bibliotece i może ją przebudować.
 */
export async function sceneNetArchitecture(
  deps: RealtimeDeps,
  campaignId: string,
  scene: { id: string; name: string },
  point: { id: number; architectureId: string | null },
): Promise<CpredNetArchitecture> {
  const prisma = deps.ctx.prisma;
  const stored = await campaignArchitectures(prisma, campaignId);
  const wired = wiredOf(stored);
  const dv = sceneDv(deps);

  if (!point.architectureId) {
    const parts = await partsFor(deps, campaignId, scene.id, stored, true);
    const built = netSceneArchitecture({
      sceneName: scene.name,
      dv,
      // Figura i drzwi podpięte już w innej Architekturze kampanii nie wchodzą drugi raz.
      figures: parts.figures.filter((figure) => !wired.tokens.has(figure.tokenId)),
      zones: parts.zones ?? [],
      doors: (parts.doors ?? []).filter((door) => !wired.walls.has(door.wallId)),
    });
    const row = await prisma.netArchitecture.create({
      data: { campaignId, name: built.name, difficulty: built.difficulty, data: storedData(built) },
    });
    await prisma.netAccessPoint.update({
      where: { id: point.id },
      data: { architectureId: row.id },
    });
    const architecture = architectureOf(row);
    if (!architecture) throw new RealtimeError('ARCHITECTURE_NOT_FOUND');
    await bindZones(prisma, row.id, architecture, parts.zones ?? []);
    await emitList(deps, campaignId);
    await emitAccessPoints(deps, campaignId, scene.id);
    return architecture;
  }

  const row = await prisma.netArchitecture.findUnique({ where: { id: point.architectureId } });
  const architecture = row ? architectureOf(row) : null;
  if (!row || !architecture) throw new RealtimeError('ARCHITECTURE_NOT_FOUND');
  const parts = await partsFor(
    deps,
    campaignId,
    scene.id,
    stored,
    netIsSceneArchitecture(architecture),
  );
  const grown = await adoptInto(prisma, row.id, architecture, parts, wired, dv);
  if (!grown) return architecture;
  await emitList(deps, campaignId);
  return grown;
}

/**
 * Figura z ikoną urządzenia, strefa środowiskowa albo drzwi „Sterowane
 * z Sieci” dołożone w trakcie runu (29.10; strefy i drzwi od 70d): netrunner,
 * który już trzymał węzeł, nie dostawał nowej kamery aż do ponownego
 * podłączenia, bo urządzenia dopinał tylko `netrun:start`. Teraz idą od razu
 * do Architektury runu na tej scenie (najstarszego pierwszy), a `emitRuns`
 * przelicza listę urządzeń i pożyczony wzrok. Bez runu na scenie nic się nie
 * dzieje — dopnie je najbliższe podłączenie. `glyph` odsiewa figury bez ikony
 * urządzenia; strefa i drzwi wołają bez niego.
 */
export async function adoptSceneDeviceLive(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string,
  glyph?: string | null,
): Promise<void> {
  if (glyph !== undefined) {
    const kind = sanitizeTokenGlyph(glyph);
    if (!kind || !NET_DEVICE_KIND_BY_GLYPH[kind]) return;
  }
  const prisma = deps.ctx.prisma;
  const points = await prisma.netAccessPoint.findMany({
    where: { sceneId },
    select: { id: true },
  });
  if (points.length === 0) return;
  const runs = await prisma.netRun.findMany({
    where: { campaignId, accessPointId: { in: points.map((point) => point.id) } },
    orderBy: { createdAt: 'asc' },
    select: { architecture: { select: { id: true, name: true, difficulty: true, data: true } } },
  });
  if (runs.length === 0) return;
  const stored = await campaignArchitectures(prisma, campaignId);
  const wired = wiredOf(stored);
  const dv = sceneDv(deps);
  let changed = false;
  const done = new Set<string>();
  for (const { architecture: row } of runs) {
    if (done.has(row.id)) continue;
    done.add(row.id);
    const architecture = architectureOf(row);
    if (!architecture) continue;
    // Strefy liczy się od nowa przy każdej Architekturze — poprzednia mogła je wziąć.
    const parts = await partsFor(
      deps,
      campaignId,
      sceneId,
      await campaignArchitectures(prisma, campaignId),
      netIsSceneArchitecture(architecture),
    );
    const grown = await adoptInto(prisma, row.id, architecture, parts, wired, dv);
    if (!grown) continue;
    for (const tokenId of netWiredTokenIds([grown])) wired.tokens.add(tokenId);
    for (const wallId of netWiredWallIds([grown])) wired.walls.add(wallId);
    changed = true;
  }
  if (!changed) return;
  await emitList(deps, campaignId);
  await emitRuns(deps, campaignId);
}

/**
 * Zdejmuje urządzenie Sieci ze sceny ze wszystkich Architektur kampanii (70d):
 * drzwi, którym MG odhaczył „Sterowane z Sieci” (`wall-<id>`), strefa „Poza
 * Siecią” (`zone-<id>`) — z jej wiązaniem #33, jeśli wskazywało właśnie to
 * urządzenie. Węzeł zostaje, nawet pusty (pozycje pięter trwających runów).
 */
export async function releaseSceneDevice(
  deps: RealtimeDeps,
  campaignId: string,
  deviceId: string,
  zoneId?: number,
): Promise<void> {
  const prisma = deps.ctx.prisma;
  let changed = false;
  for (const { rowId, architecture } of await campaignArchitectures(prisma, campaignId)) {
    const { architecture: next, removed } = netReleaseSceneDevice(architecture, deviceId);
    if (!removed) continue;
    await prisma.netArchitecture.update({
      where: { id: rowId },
      data: { data: storedData(next) },
    });
    changed = true;
  }
  if (zoneId !== undefined) {
    const unbound = await prisma.defenseZone.updateMany({
      where: { id: zoneId, deviceId },
      data: { architectureId: null, floorId: null, deviceId: null },
    });
    if (unbound.count > 0) changed = true;
  }
  if (!changed) return;
  await emitList(deps, campaignId);
  await emitRuns(deps, campaignId);
}

/** Dopina niepodpięte urządzenia i zapisuje Architekturę; null — nic nie doszło. */
async function adoptInto(
  prisma: PrismaClient,
  architectureId: string,
  architecture: CpredNetArchitecture,
  parts: NetSceneParts,
  wired: { tokens: Set<string>; walls: Set<number> },
  dv: number,
): Promise<CpredNetArchitecture | null> {
  const { architecture: grown, adopted } = netAdoptSceneDevices(architecture, parts, wired, dv);
  if (adopted === 0) return null;
  await prisma.netArchitecture.update({
    where: { id: architectureId },
    data: { data: storedData(grown) },
  });
  await bindZones(prisma, architectureId, grown, parts.zones ?? []);
  return grown;
}

function wiredOf(stored: readonly StoredArchitecture[]): {
  tokens: Set<string>;
  walls: Set<number>;
} {
  const architectures = stored.map((item) => item.architecture);
  return { tokens: netWiredTokenIds(architectures), walls: netWiredWallIds(architectures) };
}

const sceneDv = (deps: RealtimeDeps) =>
  netDifficultyDv('standard', netrunningDataOf(deps.ctx.cpred)) || NET_SCENE_CONTROL_DV;
