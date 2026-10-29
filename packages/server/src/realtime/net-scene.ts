/**
 * Sieć ze sceny (etap 62, zlecenie MG z 28.10): figury z ikoną urządzenia same
 * są urządzeniami Sieci. Woła to `netrun:start`, po wszystkich odmowach —
 * podłączenie, które się nie udało, niczego w Architekturach nie zmienia —
 * a figurę postawioną w trakcie runu dopina `adoptSceneDeviceLive` (29.10).
 */
import {
  NET_DEVICE_KIND_BY_GLYPH,
  NET_SCENE_CONTROL_DV,
  netAdoptSceneDevices,
  netDifficultyDv,
  netSceneArchitecture,
  netWiredTokenIds,
  netrunningDataOf,
  sanitizeTokenGlyph,
  type CpredNetArchitecture,
  type NetSceneFigure,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { RealtimeError, type RealtimeDeps } from './registry.js';
import { architectureOf, emitAccessPoints, emitRuns } from './netrun-io.js';
import { emitList } from './netrunning.js';

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

/** Architektury nie zapisują własnego id — kluczem jest wiersz (jak `net:save`). */
const storedData = (architecture: CpredNetArchitecture) =>
  JSON.stringify({ ...architecture, id: undefined });

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
  const figures = await sceneFigures(prisma, scene.id);
  const wired = await wiredInCampaign(prisma, campaignId);
  const dv = sceneDv(deps);

  if (!point.architectureId) {
    const built = netSceneArchitecture({
      sceneName: scene.name,
      dv,
      // Figura podpięta już w innej Architekturze kampanii nie wchodzi drugi raz.
      figures: figures.filter((figure) => !wired.has(figure.tokenId)),
    });
    const row = await prisma.netArchitecture.create({
      data: { campaignId, name: built.name, difficulty: built.difficulty, data: storedData(built) },
    });
    await prisma.netAccessPoint.update({
      where: { id: point.id },
      data: { architectureId: row.id },
    });
    await emitList(deps, campaignId);
    await emitAccessPoints(deps, campaignId, scene.id);
    const architecture = architectureOf(row);
    if (!architecture) throw new RealtimeError('ARCHITECTURE_NOT_FOUND');
    return architecture;
  }

  const row = await prisma.netArchitecture.findUnique({ where: { id: point.architectureId } });
  const architecture = row ? architectureOf(row) : null;
  if (!row || !architecture) throw new RealtimeError('ARCHITECTURE_NOT_FOUND');
  const grown = await adoptInto(prisma, row.id, architecture, figures, wired, dv);
  if (!grown) return architecture;
  await emitList(deps, campaignId);
  return grown;
}

/**
 * Figura z ikoną urządzenia postawiona (albo przemalowana) w trakcie runu
 * (29.10): netrunner, który już trzymał węzeł, nie dostawał obrazu nowej
 * kamery aż do ponownego podłączenia, bo figury dopinał tylko `netrun:start`.
 * Teraz idą od razu do Architektury runu na tej scenie (najstarszego pierwszy),
 * a `emitRuns` przelicza listę urządzeń i pożyczony wzrok. Bez runu na scenie
 * nic się nie dzieje — dopnie je najbliższe podłączenie.
 */
export async function adoptSceneDeviceLive(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string,
  glyph: string | null,
): Promise<void> {
  const kind = sanitizeTokenGlyph(glyph);
  if (!kind || !NET_DEVICE_KIND_BY_GLYPH[kind]) return;
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
  const figures = await sceneFigures(prisma, sceneId);
  const wired = await wiredInCampaign(prisma, campaignId);
  const dv = sceneDv(deps);
  let changed = false;
  for (const { architecture: row } of runs) {
    const architecture = architectureOf(row);
    if (!architecture) continue;
    const grown = await adoptInto(prisma, row.id, architecture, figures, wired, dv);
    if (!grown) continue;
    for (const tokenId of netWiredTokenIds([grown])) wired.add(tokenId);
    changed = true;
  }
  if (!changed) return;
  await emitList(deps, campaignId);
  await emitRuns(deps, campaignId);
}

/** Dopina niepodpięte figury i zapisuje Architekturę; null — nic nie doszło. */
async function adoptInto(
  prisma: PrismaClient,
  architectureId: string,
  architecture: CpredNetArchitecture,
  figures: readonly NetSceneFigure[],
  wired: ReadonlySet<string>,
  dv: number,
): Promise<CpredNetArchitecture | null> {
  const { architecture: grown, adopted } = netAdoptSceneDevices(architecture, figures, wired, dv);
  if (adopted === 0) return null;
  await prisma.netArchitecture.update({
    where: { id: architectureId },
    data: { data: storedData(grown) },
  });
  return grown;
}

async function wiredInCampaign(prisma: PrismaClient, campaignId: string): Promise<Set<string>> {
  const rows = await prisma.netArchitecture.findMany({
    where: { campaignId },
    select: { id: true, name: true, difficulty: true, data: true },
  });
  return netWiredTokenIds(
    rows.map(architectureOf).filter((entry): entry is CpredNetArchitecture => entry !== null),
  );
}

const sceneDv = (deps: RealtimeDeps) =>
  netDifficultyDv('standard', netrunningDataOf(deps.ctx.cpred)) || NET_SCENE_CONTROL_DV;
