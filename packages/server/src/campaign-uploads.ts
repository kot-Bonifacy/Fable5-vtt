import { copyFile, mkdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { CampaignUploadDir, CampaignUploadRef, SessionUser } from '@vtt/shared';
import {
  CAMPAIGN_UPLOAD_DIRS,
  ROLE_GM,
  SHARED_UPLOADS_PREFIX,
  UPLOAD_URL_PATTERN,
  campaignUploadUrl,
  parseCampaignUploadUrl,
} from '@vtt/shared';
import type { PrismaClient } from './db.js';
import { campaignRunBy } from './routes/helpers.js';
import { RealtimeError } from './realtime/registry.js';

/**
 * Pliki kampanii (etap 44b, decyzja MG z 03.10 — wariant A).
 *
 * Każdy wgrany plik leży w `uploads/campaigns/<id kampanii>/<katalog>/`, a jego
 * adres niesie id kampanii. Strażnik `/uploads/*` (`app.ts`) rozstrzyga dostęp
 * po samej ścieżce — MG tej kampanii albo jej gracz — bez szukania adresu po
 * kilkunastu kolumnach bazy. Wspólne zostają tylko `uploads/art/` (mapa
 * powitalna) i dane `/public/`.
 */

/** Katalog na dysku dla plików jednego rodzaju w jednej kampanii. */
export function campaignUploadDir(
  uploadsDir: string,
  campaignId: string,
  dir: CampaignUploadDir,
): string {
  return join(uploadsDir, 'campaigns', campaignId, dir);
}

/** Zapisuje plik w katalogu kampanii i zwraca jego adres. */
export async function campaignUploadTarget(
  uploadsDir: string,
  campaignId: string,
  dir: CampaignUploadDir,
  file: string,
): Promise<{ path: string; url: string }> {
  const directory = campaignUploadDir(uploadsDir, campaignId, dir);
  await mkdir(directory, { recursive: true });
  return { path: join(directory, file), url: campaignUploadUrl(campaignId, dir, file) };
}

/** Ścieżka na dysku dla adresu pliku kampanii albo płaskiego sprzed 44b; null dla reszty. */
export function uploadPathOfUrl(uploadsDir: string, url: string): string | null {
  const ref = parseCampaignUploadUrl(url);
  if (ref) return join(campaignUploadDir(uploadsDir, ref.campaignId, ref.dir), ref.file);
  const flat = parseFlatUploadUrl(url);
  return flat ? join(uploadsDir, flat.dir, flat.file) : null;
}

const FLAT_UPLOAD_URL =
  /^\/uploads\/(maps|tokens|handouts|portraits|music)\/([A-Za-z0-9_-]+\.[A-Za-z0-9]+)$/;

/** Adres płaski sprzed 44b (`/uploads/maps/x.png`) — do migracji i importu starych plików. */
export function parseFlatUploadUrl(url: string): { dir: CampaignUploadDir; file: string } | null {
  const match = FLAT_UPLOAD_URL.exec(url);
  return match ? { dir: match[1] as CampaignUploadDir, file: match[2]! } : null;
}

/**
 * Czy adres obrazka wolno zapisać w obiekcie tej kampanii: pusty, wspólny,
 * dane publiczne albo plik **tej** kampanii. Plik innej kampanii nie wyświetli
 * się tu nikomu (strażnik go nie wyda), a w bazie byłby nitką do cudzego stołu.
 */
export function isOwnUploadUrl(url: string | null | undefined, campaignId: string): boolean {
  if (url === null || url === undefined || url === '') return true;
  if (url.startsWith(SHARED_UPLOADS_PREFIX) || url.startsWith('/public/')) return true;
  return parseCampaignUploadUrl(url)?.campaignId === campaignId;
}

/** Odmowa `UPLOAD_NOT_FOUND` dla adresu spoza kampanii — wspólna dla zdarzeń, które go zapisują. */
export function requireOwnUploadUrl(url: string | null | undefined, campaignId: string): void {
  if (!isOwnUploadUrl(url, campaignId)) throw new RealtimeError('UPLOAD_NOT_FOUND');
}

/**
 * Czy to konto może pobrać ten plik kampanii: MG, który ją prowadzi, albo jej
 * gracz. Grafikę handoutu gracz dostaje dopiero, gdy MG mu ten handout
 * udostępnił (Z7 z T2) — adres nieudostępnionego handoutu nic mu nie da.
 */
export async function campaignUploadReadable(
  prisma: PrismaClient,
  user: SessionUser,
  ref: CampaignUploadRef,
  url: string,
): Promise<boolean> {
  if (user.role === ROLE_GM) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: ref.campaignId },
      select: { gmId: true },
    });
    return campaign !== null && campaignRunBy(campaign, user.id);
  }
  const member = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId: ref.campaignId, userId: user.id } },
    select: { userId: true },
  });
  if (!member) return false;
  if (ref.dir !== 'handouts') return true;
  const shared = await prisma.handout.findFirst({
    where: { campaignId: ref.campaignId, imageUrl: url, shares: { some: { userId: user.id } } },
    select: { id: true },
  });
  return shared !== null;
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Import pliku wymiany.

/**
 * Przenosi adresy plików z pliku wymiany (karta, scena) do kampanii, do której
 * plik wjeżdża (decyzja MG z 03.10): plik z innej kampanii, którą importujący
 * MG może czytać, i stary płaski plik są kopiowane do katalogu kampanii
 * docelowej; plik, do którego importujący nie ma dostępu albo którego nie ma na
 * dysku, odpada (`null`, w tekście — pusty napis). Plik wymiany niesie same
 * adresy, nie obrazki, więc między serwerami i między MG grafika nie jedzie.
 */
export async function localizeArchiveUploads(
  file: unknown,
  options: {
    uploadsDir: string;
    campaignId: string;
    canRead: (campaignId: string) => Promise<boolean>;
  },
): Promise<unknown> {
  const urls = new Set<string>();
  const collect = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(UPLOAD_URL_PATTERN)) urls.add(match[0]);
    } else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect(file);
  if (urls.size === 0) return file;

  const readable = new Map<string, boolean>();
  const mapping = new Map<string, string | null>();
  for (const url of urls) mapping.set(url, await localizeOne(url));

  async function localizeOne(url: string): Promise<string | null> {
    if (url.startsWith(SHARED_UPLOADS_PREFIX)) return url;
    const ref = parseCampaignUploadUrl(url);
    let dir: CampaignUploadDir;
    let name: string;
    if (ref) {
      if (ref.campaignId === options.campaignId) return url;
      if (!readable.has(ref.campaignId)) {
        readable.set(ref.campaignId, await options.canRead(ref.campaignId));
      }
      if (!readable.get(ref.campaignId)) return null;
      dir = ref.dir;
      name = ref.file;
    } else {
      const flat = parseFlatUploadUrl(url);
      if (!flat) return null;
      dir = flat.dir;
      name = flat.file;
    }
    const source = uploadPathOfUrl(options.uploadsDir, url);
    if (!source || !(await exists(source))) return null;
    const target = await campaignUploadTarget(options.uploadsDir, options.campaignId, dir, name);
    if (!(await exists(target.path))) await copyFile(source, target.path);
    return target.url;
  }

  const rewrite = (value: unknown): unknown => {
    if (typeof value === 'string') {
      if (mapping.has(value)) return mapping.get(value);
      return value.replace(UPLOAD_URL_PATTERN, (url) => mapping.get(url) ?? '');
    }
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, rewrite(inner)]));
    }
    return value;
  };
  return rewrite(file);
}

// ---------------------------------------------------------------------------
// Migracja płaskich katalogów (jednorazowa, przy starcie, idempotentna).

/**
 * Płaskie adresy sprzed 44b (`/uploads/maps/x.png`) w kolumnach kampanii —
 * ta sama lista co w `uploads-gc.ts`, bo to te same miejsca, które trzymają
 * adres pliku. Nowa kolumna z adresem trafia na obie.
 */
export async function migrateFlatUploads(
  prisma: PrismaClient,
  uploadsDir: string,
  log: FastifyBaseLogger,
): Promise<{ rows: number; files: number }> {
  const copied = new Set<string>();
  let rows = 0;

  const toCampaign = async (campaignId: string, url: string): Promise<string> => {
    const flat = parseFlatUploadUrl(url);
    if (!flat) return url;
    const source = join(uploadsDir, flat.dir, flat.file);
    const target = await campaignUploadTarget(uploadsDir, campaignId, flat.dir, flat.file);
    if (!(await exists(target.path)) && (await exists(source))) {
      await copyFile(source, target.path);
    }
    copied.add(source);
    return target.url;
  };
  const exact = async (campaignId: string, url: string | null): Promise<string | null> =>
    url ? toCampaign(campaignId, url) : url;
  const embedded = async (campaignId: string, text: string): Promise<string> => {
    let result = text;
    for (const match of new Set([...text.matchAll(UPLOAD_URL_PATTERN)].map((m) => m[0]))) {
      const next = await toCampaign(campaignId, match);
      if (next !== match) result = result.split(match).join(next);
    }
    return result;
  };
  const flatHint = { contains: '/uploads/' };

  for (const row of await prisma.campaign.findMany({
    where: { music: flatHint },
    select: { id: true, music: true },
  })) {
    const music = await embedded(row.id, row.music);
    if (music !== row.music) {
      await prisma.campaign.update({ where: { id: row.id }, data: { music } });
      rows += 1;
    }
  }
  for (const row of await prisma.scene.findMany({
    where: { backgroundUrl: flatHint },
    select: { id: true, campaignId: true, backgroundUrl: true },
  })) {
    const backgroundUrl = await exact(row.campaignId, row.backgroundUrl);
    if (backgroundUrl !== row.backgroundUrl) {
      await prisma.scene.update({ where: { id: row.id }, data: { backgroundUrl } });
      rows += 1;
    }
  }
  for (const row of await prisma.token.findMany({
    where: { imageUrl: flatHint },
    select: { id: true, imageUrl: true, scene: { select: { campaignId: true } } },
  })) {
    const imageUrl = await exact(row.scene.campaignId, row.imageUrl);
    if (imageUrl !== row.imageUrl) {
      await prisma.token.update({ where: { id: row.id }, data: { imageUrl } });
      rows += 1;
    }
  }
  for (const row of await prisma.tokenAsset.findMany({
    where: { url: flatHint },
    select: { id: true, campaignId: true, url: true },
  })) {
    const url = await toCampaign(row.campaignId, row.url);
    if (url !== row.url) {
      await prisma.tokenAsset.update({ where: { id: row.id }, data: { url } });
      rows += 1;
    }
  }
  for (const row of await prisma.portraitAsset.findMany({
    where: { url: flatHint },
    select: { id: true, campaignId: true, url: true },
  })) {
    const url = await toCampaign(row.campaignId, row.url);
    if (url !== row.url) {
      await prisma.portraitAsset.update({ where: { id: row.id }, data: { url } });
      rows += 1;
    }
  }
  for (const row of await prisma.handout.findMany({
    where: { OR: [{ imageUrl: flatHint }, { body: flatHint }] },
    select: { id: true, campaignId: true, imageUrl: true, body: true },
  })) {
    const imageUrl = await exact(row.campaignId, row.imageUrl);
    // Odnośnik w treści (markdown `[mapa](/uploads/…)`) jedzie razem z plikiem.
    const body = await embedded(row.campaignId, row.body);
    if (imageUrl !== row.imageUrl || body !== row.body) {
      await prisma.handout.update({ where: { id: row.id }, data: { imageUrl, body } });
      rows += 1;
    }
  }
  for (const row of await prisma.journalEntry.findMany({
    where: { body: flatHint },
    select: { id: true, campaignId: true, body: true },
  })) {
    const body = await embedded(row.campaignId, row.body);
    if (body !== row.body) {
      await prisma.journalEntry.update({ where: { id: row.id }, data: { body } });
      rows += 1;
    }
  }
  for (const row of await prisma.character.findMany({
    where: { OR: [{ portraitUrl: flatHint }, { data: flatHint }] },
    select: { id: true, campaignId: true, portraitUrl: true, data: true },
  })) {
    const portraitUrl = await exact(row.campaignId, row.portraitUrl);
    const data = await embedded(row.campaignId, row.data);
    if (portraitUrl !== row.portraitUrl || data !== row.data) {
      await prisma.character.update({ where: { id: row.id }, data: { portraitUrl, data } });
      rows += 1;
    }
  }
  for (const row of await prisma.botProfile.findMany({
    where: { portraitUrl: flatHint },
    select: { id: true, campaignId: true, portraitUrl: true },
  })) {
    const portraitUrl = await exact(row.campaignId, row.portraitUrl);
    if (portraitUrl !== row.portraitUrl) {
      await prisma.botProfile.update({ where: { id: row.id }, data: { portraitUrl } });
      rows += 1;
    }
  }
  for (const row of await prisma.characterDraft.findMany({
    where: { data: flatHint },
    select: { id: true, campaignId: true, data: true },
  })) {
    const data = await embedded(row.campaignId, row.data);
    if (data !== row.data) {
      await prisma.characterDraft.update({ where: { id: row.id }, data: { data } });
      rows += 1;
    }
  }
  for (const row of await prisma.chatMessage.findMany({
    where: { payload: flatHint },
    select: { id: true, campaignId: true, payload: true },
  })) {
    if (row.payload === null) continue;
    const payload = await embedded(row.campaignId, row.payload);
    if (payload !== row.payload) {
      await prisma.chatMessage.update({ where: { id: row.id }, data: { payload } });
      rows += 1;
    }
  }

  // Oryginały znikają dopiero po przepisaniu wszystkich wierszy — kopia w
  // katalogu kampanii już stoi, a płaskiego adresu nikt już nie wymienia.
  let files = 0;
  for (const source of copied) {
    try {
      await unlink(source);
      files += 1;
    } catch {
      // Brak oryginału (adres bez pliku) — nie ma czego sprzątać.
    }
  }
  if (rows > 0 || files > 0) {
    log.info({ rows, files }, 'flat uploads moved into campaign directories (stage 44b)');
  }
  return { rows, files };
}

/** Wszystkie katalogi plików na dysku: płaskie sprzed 44b i każdej kampanii. */
export async function uploadDirectories(
  uploadsDir: string,
  listCampaigns: () => Promise<string[]>,
): Promise<{ path: string; urlPrefix: string }[]> {
  const result: { path: string; urlPrefix: string }[] = CAMPAIGN_UPLOAD_DIRS.map((dir) => ({
    path: join(uploadsDir, dir),
    urlPrefix: `/uploads/${dir}/`,
  }));
  for (const campaignId of await listCampaigns()) {
    for (const dir of CAMPAIGN_UPLOAD_DIRS) {
      result.push({
        path: campaignUploadDir(uploadsDir, campaignId, dir),
        urlPrefix: `/uploads/campaigns/${campaignId}/${dir}/`,
      });
    }
  }
  return result;
}
