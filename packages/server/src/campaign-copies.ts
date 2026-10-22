import {
  copyFile,
  link,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { FastifyBaseLogger, FastifyReply } from 'fastify';
import yazl from 'yazl';
import type {
  ArchiveFile,
  ArchivePackageManifest,
  CampaignCopyReason,
  CampaignCopySummary,
} from '@vtt/shared';
import {
  ARCHIVE_PACKAGE_DATA,
  ARCHIVE_PACKAGE_MANIFEST,
  CAMPAIGN_COPY_INTERVAL_MINUTES_DEFAULT,
  CAMPAIGN_COPY_KEEP_SESSIONS_DEFAULT,
  CAMPAIGN_COPY_REASON_LABELS,
  campaignCopyName,
  parseCampaignCopyName,
  planCampaignCopyRotation,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import type { PrismaClient } from './db.js';
import { archiveContentDisposition, exportCampaign, type CampaignArchive } from './archive.js';
import { buildPackage, type StagedArchive } from './archive-package.js';

/**
 * Automatyczne kopie kampanii (etap 57b, decyzja MG 5).
 *
 * Serwer sam odkłada kopię kampanii przy **starcie** i **końcu** sesji oraz
 * **co godzinę** w jej trakcie, a zostają kopie z `keepSessions` ostatnich
 * sesji. Z nich MG cofa kampanię (`campaign-rollback.ts`) albo pobiera paczkę.
 *
 * **Ten sam kod danych co plik wymiany (57a).** Kopia to rozłożona paczka:
 * katalog `<BACKUP_DIR>/campaigns/<id kampanii>/<nazwa>/` z `manifest.json`,
 * `data.json` (bez czatu, z walkami) i `files/<katalog>/<plik>`. ZIP składa
 * się dopiero przy pobraniu, a cofnięcie czyta katalog tak, jakby paczkę
 * właśnie rozpakowano (`StagedArchive`).
 *
 * **Grafiki to twarde dowiązania do `uploads/`**, jak w kopiach bazy (etap
 * 33): dziesięć sesji po kilka kopii nie mnoży 28 MB map. Bezpieczne z tego
 * samego powodu — plik uploadu jest niezmienny. Dowiązanie wymaga **jednego
 * montowania** `uploads/` i kopii; na VPS do 57b były to dwa osobne bind
 * mounty i każda kopia bazy była pełną kopią plików (`linked: false`).
 *
 * **Nie blokuje stołu.** Dane czyta się od razu (start sesji ma odłożyć stan
 * *sprzed* odnowienia Szczęścia), zapis na dysk idzie w tle, kolejką na
 * kampanię. Błąd kopii trafia do dziennika serwera i do MG (`onFailure`),
 * nigdy do graczy i nigdy nie zatrzymuje sesji.
 *
 * **Katalog powstaje pod nazwą `.partial` i dopiero na końcu dostaje swoją.**
 * Lista i rotacja widzą wyłącznie nazwy ze schematu, więc kopia przerwana
 * w połowie (pad procesu) nie udaje kompletnej.
 */

/** Nagłówek kopii: manifest paczki plus to, czego paczka do pobrania nie mówi. */
export interface CampaignCopyManifest extends ArchivePackageManifest {
  copy: {
    campaignId: string;
    reason: CampaignCopyReason;
    takenAt: string;
    sessionStartedAt: string | null;
  };
}

export interface CampaignCopySettings {
  /** `<BACKUP_DIR>/campaigns`. */
  root: string;
  uploadsDir: string;
  keepSessions: number;
  intervalMinutes: number;
}

/** Ustawienia kopii kampanii z konfiguracji, albo `null` — ten proces kopii nie robi. */
export function campaignCopySettings(config: ServerConfig): CampaignCopySettings | null {
  if (!config.backups) return null;
  return {
    root: join(config.backups.dir, 'campaigns'),
    uploadsDir: config.uploadsDir,
    keepSessions: config.backups.campaignKeepSessions ?? CAMPAIGN_COPY_KEEP_SESSIONS_DEFAULT,
    intervalMinutes:
      config.backups.campaignIntervalMinutes ?? CAMPAIGN_COPY_INTERVAL_MINUTES_DEFAULT,
  };
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

/** Dowiąż plik, a gdy się nie da (inny wolumin) — skopiuj. `false` — pliku już nie ma. */
export async function linkOrCopy(from: string, to: string): Promise<boolean> {
  try {
    await link(from, to);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
  }
  try {
    await copyFile(from, to);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

async function readManifest(dir: string): Promise<CampaignCopyManifest | null> {
  try {
    const raw = JSON.parse(await readFile(join(dir, ARCHIVE_PACKAGE_MANIFEST), 'utf8')) as unknown;
    const manifest = raw as Partial<CampaignCopyManifest>;
    if (!manifest.copy || !Array.isArray(manifest.entries)) return null;
    return manifest as CampaignCopyManifest;
  } catch {
    return null;
  }
}

/** Wiersz panelu z katalogu kopii, albo `null` — to nie jest (kompletna) kopia. */
async function summarize(dir: string, name: string): Promise<CampaignCopySummary | null> {
  const parsed = parseCampaignCopyName(name);
  if (!parsed) return null;
  const manifest = await readManifest(join(dir, name));
  if (!manifest) return null;
  const dataBytes = (await stat(join(dir, name, ARCHIVE_PACKAGE_DATA)).catch(() => null))?.size;
  if (dataBytes === undefined) return null;
  const sizes = new Map(manifest.entries.map((entry) => [entry.path, entry.bytes] as const));
  return {
    name,
    takenAt: manifest.copy.takenAt,
    reason: parsed.reason,
    sessionStartedAt: manifest.copy.sessionStartedAt,
    bytes: dataBytes + [...sizes.values()].reduce((sum, bytes) => sum + bytes, 0),
    files: sizes.size,
    counts: manifest.counts,
  };
}

/** Kopie jednej kampanii, od najświeższej. */
export async function listCampaignCopies(dir: string): Promise<CampaignCopySummary[]> {
  let names: string[];
  try {
    names = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  const rows: CampaignCopySummary[] = [];
  for (const name of names) {
    const row = await summarize(dir, name);
    if (row) rows.push(row);
  }
  return rows.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

/** Zdejmij kopie spoza `keepSessions` ostatnich sesji. Zwraca usunięte. */
export async function rotateCampaignCopies(dir: string, keepSessions: number): Promise<string[]> {
  const copies = await listCampaignCopies(dir);
  const plan = planCampaignCopyRotation(
    copies.map((copy) => ({ name: copy.name, session: copy.sessionStartedAt })),
    keepSessions,
  );
  for (const name of plan.drop) await rm(join(dir, name), { recursive: true, force: true });
  return plan.drop;
}

/**
 * Zapisz kopię z gotowego pliku wymiany. Grafika, która zniknęła między
 * odczytem danych a dowiązaniem (sprzątanie sierot), wypada z listy —
 * kopia ma powstać, a nie wywrócić się na jednym pliku.
 */
export async function writeCampaignCopy(
  dir: string,
  uploadsDir: string,
  name: string,
  file: ArchiveFile<CampaignArchive>,
  copy: CampaignCopyManifest['copy'],
): Promise<CampaignCopySummary> {
  const { manifest, files } = await buildPackage(uploadsDir, file);
  const partial = join(dir, `${name}.partial`);
  await rm(partial, { recursive: true, force: true });
  await mkdir(partial, { recursive: true });
  await writeFile(join(partial, ARCHIVE_PACKAGE_DATA), JSON.stringify(file.payload, null, 2));
  const missing = new Set<string>();
  for (const entry of files) {
    const target = join(partial, ...entry.path.split('/'));
    await mkdir(join(target, '..'), { recursive: true });
    if (!(await linkOrCopy(entry.disk, target))) missing.add(entry.path);
  }
  const head: CampaignCopyManifest = {
    ...manifest,
    entries: manifest.entries.filter((entry) => !missing.has(entry.path)),
    copy,
  };
  // Manifest na końcu: katalog bez niego nie jest kopią (`summarize`).
  await writeFile(join(partial, ARCHIVE_PACKAGE_MANIFEST), JSON.stringify(head, null, 2));
  await rm(join(dir, name), { recursive: true, force: true });
  await rename(partial, join(dir, name));
  const row = await summarize(dir, name);
  if (!row) throw new Error(`campaign copy ${name} unreadable right after writing`);
  return row;
}

/**
 * Kopia czytana tak, jak rozpakowana paczka — wejście cofnięcia. `null`, gdy
 * nazwa jest spoza schematu (nic spoza katalogu kampanii) albo kopii nie ma.
 */
export async function readCampaignCopy(dir: string, name: string): Promise<StagedArchive | null> {
  if (!parseCampaignCopyName(name)) return null;
  const root = join(dir, name);
  const manifest = await readManifest(root);
  if (!manifest) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(await readFile(join(root, ARCHIVE_PACKAGE_DATA), 'utf8')) as unknown;
  } catch {
    return null;
  }
  const files = new Map<string, string>();
  for (const entry of manifest.entries) {
    const disk = join(root, ...entry.path.split('/'));
    if ((await stat(disk).catch(() => null))?.isFile()) files.set(entry.url, disk);
  }
  return { file: { manifest, payload }, files, packaged: true };
}

/** Pobranie kopii jako paczki ZIP — ta sama paczka, co „Pobierz kampanię” (bez czatu). */
export async function sendCampaignCopy(
  reply: FastifyReply,
  dir: string,
  name: string,
  campaignName: string,
): Promise<FastifyReply | null> {
  if (!parseCampaignCopyName(name)) return null;
  const root = join(dir, name);
  const manifest = await readManifest(root);
  if (!manifest) return null;
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), ARCHIVE_PACKAGE_MANIFEST);
  zip.addFile(join(root, ARCHIVE_PACKAGE_DATA), ARCHIVE_PACKAGE_DATA);
  for (const path of new Set(manifest.entries.map((entry) => entry.path))) {
    zip.addFile(join(root, ...path.split('/')), path, { compress: false });
  }
  zip.end();
  const label = `${campaignName} ${CAMPAIGN_COPY_REASON_LABELS[manifest.copy.reason]}`;
  return reply
    .header('Content-Type', 'application/zip')
    .header(
      'Content-Disposition',
      archiveContentDisposition('campaign', label, new Date(manifest.copy.takenAt), 'zip'),
    )
    .send(zip.outputStream as unknown as Readable);
}

/** Zdanie dla MG, gdy kopia się nie udała. */
function failureText(reason: CampaignCopyReason): string {
  return `Nie udała się kopia kampanii (${CAMPAIGN_COPY_REASON_LABELS[reason]}) — szczegóły w dzienniku serwera. Gra idzie dalej.`;
}

/**
 * Kopie kampanii jednego procesu: kolejka zapisu na kampanię, zegar kopii
 * „co godzinę” i rotacja po każdej kopii.
 */
export class CampaignCopies {
  /** Błąd kopii dla MG kampanii — podpina go warstwa gniazd. */
  onFailure: ((campaignId: string, text: string) => void) | undefined;
  /** Kopia zapisana (i rotacja po niej) — panel „Kopie” MG odświeża listę. */
  onWritten: ((campaignId: string) => void) | undefined;

  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly lastCopyAt = new Map<string, number>();
  private lastStamp = 0;

  constructor(
    private readonly prisma: PrismaClient,
    readonly settings: CampaignCopySettings,
    private readonly log: FastifyBaseLogger,
  ) {}

  dirOf(campaignId: string): string {
    return join(this.settings.root, campaignId);
  }

  list(campaignId: string): Promise<CampaignCopySummary[]> {
    return listCampaignCopies(this.dirOf(campaignId));
  }

  read(campaignId: string, name: string): Promise<StagedArchive | null> {
    return readCampaignCopy(this.dirOf(campaignId), name);
  }

  /**
   * Odczytaj stan kampanii **teraz** i odłóż kopię w tle. Nigdy nie rzuca:
   * błąd idzie do dziennika i do MG. Start sesji czeka wyłącznie na odczyt.
   */
  async capture(
    campaignId: string,
    reason: CampaignCopyReason,
    sessionStartedAt: Date | null,
    now = Date.now(),
  ): Promise<void> {
    let file: ArchiveFile<CampaignArchive> | null;
    try {
      file = await this.exportNow(campaignId);
    } catch (error) {
      this.fail(campaignId, reason, error);
      return;
    }
    if (!file) return;
    const ready = file;
    void this.enqueue(campaignId, () =>
      this.write(campaignId, reason, sessionStartedAt, now, ready),
    ).catch((error: unknown) => this.fail(campaignId, reason, error));
  }

  /** Kopia na miejscu, z czekaniem i błędem — kopia bezpieczeństwa przed cofnięciem. */
  async takeNow(
    campaignId: string,
    reason: CampaignCopyReason,
    sessionStartedAt: Date | null,
    now = Date.now(),
  ): Promise<CampaignCopySummary> {
    const file = await this.exportNow(campaignId);
    if (!file) throw new Error(`campaign ${campaignId} not found`);
    return this.enqueue(campaignId, () =>
      this.write(campaignId, reason, sessionStartedAt, now, file),
    );
  }

  /** Kopia „co godzinę” dla trwających sesji — woła ją minutowy zegar sesji. */
  async tick(now = Date.now()): Promise<void> {
    const running = await this.prisma.campaign.findMany({
      where: { sessionStartedAt: { not: null } },
      select: { id: true, sessionStartedAt: true },
    });
    const interval = this.settings.intervalMinutes * 60_000;
    for (const { id, sessionStartedAt } of running) {
      if (!sessionStartedAt) continue;
      let last = this.lastCopyAt.get(id);
      if (last === undefined) {
        // Po restarcie procesu: najświeższa kopia z dysku, a bez niej start sesji.
        const newest = (await this.list(id))[0];
        last = Math.max(
          sessionStartedAt.getTime(),
          newest ? new Date(newest.takenAt).getTime() : 0,
        );
        this.lastCopyAt.set(id, last);
      }
      if (now - last < interval) continue;
      this.lastCopyAt.set(id, now);
      await this.capture(id, 'hourly', sessionStartedAt, now);
    }
  }

  /** Czeka, aż kopie w kolejce (jednej kampanii albo wszystkich) się zapiszą. */
  async settled(campaignId?: string): Promise<void> {
    const pending = campaignId ? [this.queues.get(campaignId)] : [...this.queues.values()];
    await Promise.allSettled(pending);
  }

  private exportNow(campaignId: string): Promise<ArchiveFile<CampaignArchive> | null> {
    return exportCampaign(this.prisma, campaignId, { includeChat: false, includeCombat: true });
  }

  private enqueue<T>(campaignId: string, job: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(campaignId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(job);
    this.queues.set(campaignId, next);
    void next
      .catch(() => undefined)
      .finally(() => {
        if (this.queues.get(campaignId) === next) this.queues.delete(campaignId);
      });
    return next;
  }

  /** Chwila kopii rośnie ściśle — dwie kopie w jednej milisekundzie dostają różne nazwy. */
  private stamp(now: number): number {
    this.lastStamp = Math.max(now, this.lastStamp + 1);
    return this.lastStamp;
  }

  private async write(
    campaignId: string,
    reason: CampaignCopyReason,
    sessionStartedAt: Date | null,
    now: number,
    file: ArchiveFile<CampaignArchive>,
  ): Promise<CampaignCopySummary> {
    const takenAt = new Date(this.stamp(now));
    const name = campaignCopyName(takenAt, reason);
    const dir = this.dirOf(campaignId);
    await mkdir(dir, { recursive: true });
    const row = await writeCampaignCopy(dir, this.settings.uploadsDir, name, file, {
      campaignId,
      reason,
      takenAt: takenAt.toISOString(),
      sessionStartedAt: sessionStartedAt?.toISOString() ?? null,
    });
    this.lastCopyAt.set(campaignId, Math.max(this.lastCopyAt.get(campaignId) ?? 0, now));
    const dropped = await rotateCampaignCopies(dir, this.settings.keepSessions);
    this.log.info(
      { campaignId, copy: name, bytes: row.bytes, dropped: dropped.length },
      'campaign copy taken',
    );
    this.onWritten?.(campaignId);
    return row;
  }

  private fail(campaignId: string, reason: CampaignCopyReason, error: unknown): void {
    this.log.error({ err: error, campaignId, reason }, 'campaign copy failed');
    this.onFailure?.(campaignId, failureText(reason));
  }
}
