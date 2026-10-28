/**
 * Sieć ze sceny (etap 62, zlecenie MG z 28.10): figury z ikoną urządzenia same
 * są urządzeniami Sieci. Woła to tylko `netrun:start`, po wszystkich odmowach —
 * podłączenie, które się nie udało, niczego w Architekturach nie zmienia.
 */
import {
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
import { architectureOf, emitAccessPoints } from './netrun-io.js';
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
  const rows = await prisma.netArchitecture.findMany({
    where: { campaignId },
    select: { id: true, name: true, difficulty: true, data: true },
  });
  const wired = netWiredTokenIds(
    rows.map(architectureOf).filter((entry): entry is CpredNetArchitecture => entry !== null),
  );
  const dv = netDifficultyDv('standard', netrunningDataOf(deps.ctx.cpred)) || NET_SCENE_CONTROL_DV;

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
  const { architecture: grown, adopted } = netAdoptSceneDevices(architecture, figures, wired, dv);
  if (adopted === 0) return architecture;
  await prisma.netArchitecture.update({
    where: { id: row.id },
    data: { data: storedData(grown) },
  });
  await emitList(deps, campaignId);
  return grown;
}
