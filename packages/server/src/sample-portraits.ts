import { randomBytes } from 'node:crypto';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { PORTRAIT_NAME_MAX_LENGTH, SAMPLE_PORTRAIT_FILE_PATTERN } from '@vtt/shared';
import type { PrismaClient } from './db.js';
import { campaignUploadTarget } from './campaign-uploads.js';

/**
 * Przykładowe portrety (MG 21.11.2026) — zestaw avatarów MG, który dostaje
 * pula portretów każdej kampanii: nowej przy założeniu, istniejącej raz, przy
 * pierwszym starcie serwera z tym kodem (`Campaign.samplePortraitsSeeded`).
 *
 * Pliki i `manifest.json` robi `tools/art/sample-portraits.py` do
 * `packages/server/assets/sample-portraits/` — poza `data/public/`, bo ten
 * katalog serwer wydaje każdemu jako `/public/`, a portrety „tylko MG” mają
 * dojść do gracza wyłącznie przez strażnika plików kampanii. Każda kampania
 * dostaje własne kopie w `uploads/campaigns/<id>/portraits/` i zwykłe wiersze
 * `PortraitAsset`, więc kadr, „tylko MG”, kosz, eksport i kopie zapasowe
 * działają na nich jak na wgranych ręcznie. Skasowanych nie dokłada się
 * ponownie — flaga mówi „już były”, a nie „są”.
 */
export interface SamplePortrait {
  file: string;
  name: string;
  gmOnly: boolean;
  width: number;
  height: number;
}

function readSample(raw: unknown): SamplePortrait | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const { file, name, gmOnly, width, height } = row;
  if (typeof file !== 'string' || !SAMPLE_PORTRAIT_FILE_PATTERN.test(file)) return null;
  if (typeof name !== 'string' || name.trim() === '') return null;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  if ((width as number) <= 0 || (height as number) <= 0) return null;
  return {
    file,
    name: name.trim().slice(0, PORTRAIT_NAME_MAX_LENGTH),
    gmOnly: gmOnly === true,
    width: width as number,
    height: height as number,
  };
}

/** Zestaw z `manifest.json`; brak katalogu albo zły plik — pusty zestaw. */
export async function loadSamplePortraits(
  dir: string | undefined,
  log?: FastifyBaseLogger,
): Promise<SamplePortrait[]> {
  if (!dir) return [];
  let text: string;
  try {
    text = await readFile(join(dir, 'manifest.json'), 'utf8');
  } catch {
    log?.warn({ dir }, 'sample portraits: no manifest, campaigns get none');
    return [];
  }
  try {
    const parsed = JSON.parse(text) as { portraits?: unknown };
    const rows = Array.isArray(parsed.portraits) ? parsed.portraits : [];
    const samples = rows.map(readSample).filter((row): row is SamplePortrait => row !== null);
    if (samples.length < rows.length) {
      log?.warn({ dir, skipped: rows.length - samples.length }, 'sample portraits: bad rows');
    }
    return samples;
  } catch {
    log?.warn({ dir }, 'sample portraits: manifest is not JSON');
    return [];
  }
}

/**
 * Dokłada zestaw do puli kampanii i stawia jej flagę. Pliki kopiuje przed
 * zapisem w bazie: przerwane w połowie zostawia najwyżej pliki bez wiersza,
 * które sprzątnie `uploads-gc`, a flaga zostaje zgaszona do następnej próby.
 */
export async function seedSamplePortraits(
  prisma: PrismaClient,
  options: { uploadsDir: string; samplesDir: string | undefined; samples: SamplePortrait[] },
  campaignId: string,
): Promise<number> {
  const { uploadsDir, samplesDir, samples } = options;
  // Bez zestawu (testy, brak katalogu) flaga zostaje zgaszona — kampania
  // dostanie portrety, gdy zestaw się pojawi.
  if (!samplesDir || samples.length === 0) return 0;
  const rows: {
    campaignId: string;
    name: string;
    url: string;
    width: number;
    height: number;
    gmOnly: boolean;
    createdAt: Date;
  }[] = [];
  // Galeria układa pulę od najnowszego (`createdAt desc`): „Avatar 01” dostaje
  // najpóźniejszą chwilę, każdy następny o milisekundę wcześniejszą — a całość
  // ląduje pod portretami, które MG wgrał wcześniej sam (starsze kampanie).
  const oldest = await prisma.portraitAsset.findFirst({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  const base = oldest ? oldest.createdAt.getTime() - 1000 : Date.now();
  for (const sample of samples) {
    const target = await campaignUploadTarget(
      uploadsDir,
      campaignId,
      'portraits',
      `${randomBytes(12).toString('base64url')}.webp`,
    );
    await copyFile(join(samplesDir, sample.file), target.path);
    rows.push({
      campaignId,
      name: sample.name,
      url: target.url,
      width: sample.width,
      height: sample.height,
      gmOnly: sample.gmOnly,
      createdAt: new Date(base - rows.length),
    });
  }
  await prisma.$transaction(async (tx) => {
    await tx.portraitAsset.createMany({ data: rows });
    await tx.campaign.update({
      where: { id: campaignId },
      data: { samplePortraitsSeeded: true },
    });
  });
  return rows.length;
}

/** Start serwera: kampanie, które zestawu jeszcze nie dostały (sprzed 21.11). */
export async function seedPendingSamplePortraits(
  prisma: PrismaClient,
  options: { uploadsDir: string; samplesDir: string | undefined; samples: SamplePortrait[] },
  log: FastifyBaseLogger,
): Promise<void> {
  if (options.samples.length === 0) return;
  const pending = await prisma.campaign.findMany({
    where: { samplePortraitsSeeded: false },
    select: { id: true },
  });
  for (const { id } of pending) {
    try {
      const added = await seedSamplePortraits(prisma, options, id);
      log.info({ campaignId: id, added }, 'sample portraits added');
    } catch (error) {
      log.error({ err: error, campaignId: id }, 'sample portraits failed');
    }
  }
}

/** Wiersz puli do założenia w transakcji wzorca — plik już leży w uploadach. */
export interface PendingPortraitRow {
  campaignId: string;
  name: string;
  url: string;
  width: number;
  height: number;
  gmOnly: boolean;
}

/**
 * Portrety figur sceny przykładowej (21.11): plik zestawu → adres w puli
 * kampanii. Najpierw wiersz puli o nazwie przykładu („Avatar 21”), także
 * z kosza — pula ma już tę twarz z kadrem MG. Gdy go nie ma (zestaw sprzed
 * kampanii skasowany albo przemianowany), plik się kopiuje, a wiersz zakłada
 * transakcja wzorca. Bez zestawu (testy, E2E) figury stają bez portretu
 * i nikt tego nie zgłasza; plik, którego zestaw nie zna, idzie do `missing`.
 */
export async function prepareTemplatePortraits(
  prisma: PrismaClient,
  options: { uploadsDir: string; samplesDir: string | undefined; samples: SamplePortrait[] },
  campaignId: string,
  files: readonly string[],
): Promise<{ urls: Map<string, string>; rows: PendingPortraitRow[]; missing: string[] }> {
  const { uploadsDir, samplesDir, samples } = options;
  const urls = new Map<string, string>();
  const rows: PendingPortraitRow[] = [];
  const missing: string[] = [];
  if (!samplesDir || samples.length === 0) return { urls, rows, missing };
  for (const file of new Set(files)) {
    const sample = samples.find((row) => row.file === file);
    if (!sample) {
      missing.push(`portrait:${file}`);
      continue;
    }
    const pooled = await prisma.portraitAsset.findFirst({
      where: { campaignId, name: sample.name },
      orderBy: [{ retired: 'asc' }, { createdAt: 'desc' }],
      select: { url: true },
    });
    if (pooled) {
      urls.set(file, pooled.url);
      continue;
    }
    const target = await campaignUploadTarget(
      uploadsDir,
      campaignId,
      'portraits',
      `${randomBytes(12).toString('base64url')}.webp`,
    );
    await copyFile(join(samplesDir, sample.file), target.path);
    urls.set(file, target.url);
    rows.push({
      campaignId,
      name: sample.name,
      url: target.url,
      width: sample.width,
      height: sample.height,
      gmOnly: sample.gmOnly,
    });
  }
  return { urls, rows, missing };
}
