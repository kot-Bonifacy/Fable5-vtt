import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, open as openFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { FastifyReply } from 'fastify';
import yauzl from 'yauzl';
import yazl from 'yazl';
import type {
  ArchiveFile,
  ArchiveKind,
  ArchivePackageEntry,
  ArchivePackageLimits,
  ArchivePackageListing,
  ArchivePackageManifest,
  ArchiveRefusalCode,
  CampaignUploadDir,
} from '@vtt/shared';
import {
  ARCHIVE_PACKAGE_DATA,
  ARCHIVE_PACKAGE_MANIFEST,
  ARCHIVE_PACKAGE_VERSION,
  UPLOAD_URL_PATTERN,
  archiveListingRefusal,
  archivePackagePath,
  archivePackageRefusal,
  archiveRefusal,
} from '@vtt/shared';
import { archiveContentDisposition } from './archive.js';
import { campaignUploadTarget, uploadPathOfUrl } from './campaign-uploads.js';

/**
 * Paczka ZIP pliku wymiany (etap 57a, decyzja MG z 22.10).
 *
 * W środku `manifest.json` (nagłówek z etapu 33 + lista plików z rozmiarem
 * i SHA-256), `data.json` (ten sam ładunek co dawny plik JSON, wcięty dwiema
 * spacjami) i `files/<katalog>/<plik>` — grafiki, do których prowadzą adresy
 * z danych. Paczka jest więc samowystarczalna: kampania, z której wyszła,
 * może zniknąć razem z katalogiem `uploads/`.
 *
 * **Eksport idzie strumieniem.** Dane (wiersze bazy) i tak są w pamięci, ale
 * grafiki — od kilku do kilkudziesięciu MB — płyną z dysku prosto do
 * odpowiedzi (`yazl.addFile`). Skrót liczy się osobnym przejściem po pliku,
 * bo manifest musi być w paczce przed nimi.
 *
 * **Import rozpakowuje do katalogu tymczasowego** i dopiero stamtąd kopiuje do
 * kampanii: paczka, która padnie na trzecim pliku, nie zostawia w `uploads/`
 * dwóch sierot. Każda ścieżka przechodzi przez `isSafeArchivePath` (zip slip),
 * łączny rozmiar po rozpakowaniu przez limit (zip bomb), a każdy plik przez
 * skrót z manifestu.
 */

/** Grafiki z adresów w danych, które jadą w paczce — bez wspólnych i bez brakujących. */
async function packageEntries(
  uploadsDir: string,
  urls: string[],
): Promise<{ entries: (ArchivePackageEntry & { disk: string })[]; missing: number }> {
  const entries: (ArchivePackageEntry & { disk: string })[] = [];
  const byPath = new Map<string, string>();
  let missing = 0;
  for (const url of urls) {
    const path = archivePackagePath(url);
    if (!path) continue;
    const disk = uploadPathOfUrl(uploadsDir, url);
    const info = disk ? await stat(disk).catch(() => null) : null;
    if (!disk || !info?.isFile()) {
      missing += 1;
      continue;
    }
    const sha256 = await fileSha256(disk);
    const twin = byPath.get(path);
    // Dwa adresy na jedną ścieżkę (plik płaski i jego kopia w kampanii) jadą
    // raz; różna zawartość pod tą samą nazwą — drugi adres odpada.
    if (twin !== undefined && twin !== sha256) {
      missing += 1;
      continue;
    }
    byPath.set(path, sha256);
    entries.push({ path, url, bytes: info.size, sha256, disk });
  }
  return { entries, missing };
}

export async function fileSha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

/** Manifest paczki z gotowego pliku wymiany — wspólny dla pobrania i kopii (57b). */
export async function buildPackage(
  uploadsDir: string,
  file: ArchiveFile<unknown>,
): Promise<{ manifest: ArchivePackageManifest; files: { path: string; disk: string }[] }> {
  const { entries, missing } = await packageEntries(uploadsDir, file.manifest.files);
  const omitted = [...file.manifest.omitted];
  if (missing > 0) {
    omitted.push(
      `Grafiki bez pliku na serwerze (${missing}) — adres został w danych, ale plik nie jedzie.`,
    );
  }
  const manifest: ArchivePackageManifest = {
    ...file.manifest,
    omitted,
    package: ARCHIVE_PACKAGE_VERSION,
    entries: entries.map(({ path, url, bytes, sha256 }) => ({ path, url, bytes, sha256 })),
  };
  const seen = new Set<string>();
  const files = entries.filter((entry) => !seen.has(entry.path) && seen.add(entry.path));
  return { manifest, files: files.map(({ path, disk }) => ({ path, disk })) };
}

/** Wyślij plik wymiany jako paczkę ZIP — strumieniem, bez składania całości w pamięci. */
export async function sendArchivePackage(
  reply: FastifyReply,
  uploadsDir: string,
  kind: ArchiveKind,
  label: string,
  file: ArchiveFile<unknown>,
): Promise<FastifyReply> {
  const { manifest, files } = await buildPackage(uploadsDir, file);
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), ARCHIVE_PACKAGE_MANIFEST);
  zip.addBuffer(Buffer.from(JSON.stringify(file.payload, null, 2)), ARCHIVE_PACKAGE_DATA);
  // Grafiki są już skompresowane (WebP, JPG, MP3) — druga kompresja kosztuje
  // procesor i nic nie daje.
  for (const entry of files) zip.addFile(entry.disk, entry.path, { compress: false });
  zip.end();
  return reply
    .header('Content-Type', 'application/zip')
    .header('Content-Disposition', archiveContentDisposition(kind, label, new Date(), 'zip'))
    .send(zip.outputStream as unknown as Readable);
}

/* ------------------------------------------------------------------ */
/* Wczytanie                                                           */
/* ------------------------------------------------------------------ */

/** Plik z „Wczytaj z pliku…”, rozpoznany i (dla paczki) rozpakowany do katalogu tymczasowego. */
export interface StagedArchive {
  file: ArchiveFile<unknown>;
  /** Adres z danych → plik w katalogu tymczasowym. Dla JSON-a z etapu 33 pusty. */
  files: Map<string, string>;
  /** Czy to paczka ZIP (57a), czy stary plik JSON (33). */
  packaged: boolean;
}

export type StageResult = StagedArchive | { code: ArchiveRefusalCode };

/** Katalog tymczasowy na jedno wczytanie — sprzątany zawsze, także po odmowie. */
export async function makeStagingDir(): Promise<string> {
  const dir = join(tmpdir(), `vtt-archive-${randomBytes(6).toString('hex')}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function startsWithZipMagic(path: string): Promise<boolean> {
  const handle = await openFile(path, 'r');
  try {
    const head = Buffer.alloc(4);
    const { bytesRead } = await handle.read(head, 0, 4, 0);
    return (
      bytesRead === 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4
    );
  } finally {
    await handle.close();
  }
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      path,
      { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => (error ? reject(error) : resolve(zip)),
    );
  });
}

/** Cały katalog ZIP-a, zanim cokolwiek się rozpakuje. */
function listEntries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: yauzl.Entry[] = [];
    zip.on('entry', (entry: yauzl.Entry) => {
      entries.push(entry);
      zip.readEntry();
    });
    zip.once('end', () => resolve(entries));
    zip.once('error', reject);
    zip.readEntry();
  });
}

function entryStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream)));
  });
}

async function entryText(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of await entryStream(zip, entry)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Rozpoznaj wgrany plik: paczka ZIP (57a) albo JSON z etapu 33. Paczkę
 * sprawdza w całości i rozpakowuje do `staging` — katalog sprząta wołający,
 * także po odmowie.
 */
export async function stageArchiveUpload(
  upload: string,
  staging: string,
  limits: ArchivePackageLimits,
): Promise<StageResult> {
  if (!(await startsWithZipMagic(upload))) {
    const file = parseJson(await readFile(upload, 'utf8'));
    const refusal = archiveRefusal(file);
    if (refusal) return { code: refusal };
    return { file: file as ArchiveFile<unknown>, files: new Map(), packaged: false };
  }

  let zip: yauzl.ZipFile;
  try {
    zip = await openZip(upload);
  } catch {
    return { code: 'ARCHIVE_PACKAGE_CORRUPT' };
  }
  try {
    let entries: yauzl.Entry[];
    try {
      entries = await listEntries(zip);
    } catch (error) {
      // yauzl sam odmawia ścieżek bezwzględnych i z `..` — to też zip slip.
      return /relative path|absolute path|invalid characters/i.test(String(error))
        ? { code: 'ARCHIVE_PACKAGE_UNSAFE_PATH' }
        : { code: 'ARCHIVE_PACKAGE_CORRUPT' };
    }
    // Wpis katalogu (`files/maps/`) nie niesie danych i niczego nie zapisuje.
    const files = entries.filter((entry) => !entry.fileName.endsWith('/'));
    const listing: ArchivePackageListing[] = files.map((entry) => ({
      path: entry.fileName,
      bytes: entry.uncompressedSize,
    }));
    const listingRefusal = archiveListingRefusal(listing, limits);
    if (listingRefusal) return { code: listingRefusal };

    const byPath = new Map(files.map((entry) => [entry.fileName, entry]));
    const manifest = parseJson(await entryText(zip, byPath.get(ARCHIVE_PACKAGE_MANIFEST)!));
    const headRefusal = archiveRefusal({ manifest });
    if (headRefusal) return { code: headRefusal };
    const packageRefusal = archivePackageRefusal(listing, manifest);
    if (packageRefusal) return { code: packageRefusal };
    const payload = parseJson(await entryText(zip, byPath.get(ARCHIVE_PACKAGE_DATA)!));
    if (payload === undefined || payload === null || typeof payload !== 'object') {
      return { code: 'ARCHIVE_MALFORMED' };
    }

    const head = manifest as ArchivePackageManifest;
    const staged = new Map<string, string>();
    const written = new Map<string, string>();
    for (const entry of head.entries) {
      let disk = written.get(entry.path);
      if (!disk) {
        disk = join(staging, ...entry.path.split('/'));
        await mkdir(join(disk, '..'), { recursive: true });
        const hash = createHash('sha256');
        const source = await entryStream(zip, byPath.get(entry.path)!);
        source.on('data', (chunk: Buffer) => hash.update(chunk));
        try {
          await pipeline(source, createWriteStream(disk));
        } catch {
          return { code: 'ARCHIVE_PACKAGE_CORRUPT' };
        }
        if (hash.digest('hex') !== entry.sha256) return { code: 'ARCHIVE_PACKAGE_CORRUPT' };
        written.set(entry.path, disk);
      }
      staged.set(entry.url, disk);
    }
    return {
      file: { manifest: head, payload },
      files: staged,
      packaged: true,
    };
  } finally {
    zip.close();
  }
}

/**
 * Przenieś rozpakowane grafiki do katalogu kampanii i oddaj mapę „stary adres →
 * nowy”. Nazwa pliku zostaje (jest losowa); gdy w kampanii leży już inny plik
 * o tej nazwie, kopia dostaje nową — ten sam plik (ten sam skrót) się nie dubluje.
 */
export async function placeStagedFiles(
  staged: Map<string, string>,
  uploadsDir: string,
  campaignId: string,
): Promise<Map<string, string>> {
  const placed = new Map<string, string>();
  const byDisk = new Map<string, string>();
  for (const [url, disk] of staged) {
    const known = byDisk.get(disk);
    if (known) {
      placed.set(url, known);
      continue;
    }
    const [, dir, name] = archivePackagePath(url)!.split('/') as [
      string,
      CampaignUploadDir,
      string,
    ];
    let target = await campaignUploadTarget(uploadsDir, campaignId, dir, name);
    const present = await stat(target.path).catch(() => null);
    if (!present?.isFile()) {
      await copyFile(disk, target.path);
    } else if ((await fileSha256(target.path)) !== (await fileSha256(disk))) {
      const fresh = `${randomBytes(12).toString('hex')}${extname(name)}`;
      target = await campaignUploadTarget(uploadsDir, campaignId, dir, fresh);
      await copyFile(disk, target.path);
    }
    byDisk.set(disk, target.url);
    placed.set(url, target.url);
  }
  return placed;
}

/**
 * Przepisz adresy grafik w danych wg mapy: pole równe adresowi dostaje nowy,
 * adres wewnątrz tekstu (markdown handoutu, JSON muzyki) — też. Adres spoza
 * mapy zostaje, jaki był; o nim rozstrzyga potem `localizeArchiveUploads`.
 */
export function rewriteUploadUrls(value: unknown, mapping: Map<string, string>): unknown {
  if (mapping.size === 0) return value;
  if (typeof value === 'string') {
    const exact = mapping.get(value);
    if (exact !== undefined) return exact;
    return value.replace(UPLOAD_URL_PATTERN, (url) => mapping.get(url) ?? url);
  }
  if (Array.isArray(value)) return value.map((inner) => rewriteUploadUrls(inner, mapping));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, rewriteUploadUrls(inner, mapping)]),
    );
  }
  return value;
}
