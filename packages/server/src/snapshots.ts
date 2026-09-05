import { constants } from 'node:fs';
import {
  access,
  copyFile,
  link,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyBaseLogger } from 'fastify';
import type { ServerConfig } from './config.js';
import type { SnapshotRules, SnapshotSummary } from '@vtt/shared';
import { planSnapshotRotation, snapshotDateOf, snapshotDayOf, snapshotName } from '@vtt/shared';

/**
 * Snapshoty bazy i plików (etap 33) — cała praca na dysku.
 *
 * Do tej sesji jedyną kopią całej kampanii był `packages/server/dev.db` na
 * jednym dysku, a dwanaście plików `dev.db.bak-*` obok niego powstało ręką,
 * zawsze tuż przed czymś ryzykownym. To jest ten sam odruch, tylko na timerze.
 *
 * Trzy rzeczy, które trzeba wiedzieć, zanim się tu cokolwiek zmieni:
 *
 * 1. **`VACUUM INTO`, nigdy `copyFile` na `.db`.** SQLite w trybie WAL trzyma
 *    część świeżego stanu w pliku `-wal` obok bazy, więc skopiowany w trakcie
 *    zapisu `.db` bywa kopią niespójną albo starszą, niż wygląda. `VACUUM INTO`
 *    zapisuje spójną migawkę **bez zatrzymywania serwera** — dlatego kopia może
 *    powstawać co godzinę w trakcie sesji, a nie tylko przy wyłączonym stole.
 *
 * 2. **Kopia otwiera bazę drugim połączeniem.** Nie idzie przez Prismę: chodzi
 *    o to, żeby ten sam kod działał w skrypcie konsolowym przy wyłączonym
 *    serwerze i w timerze przy działającym. SQLite pozwala na oba połączenia
 *    naraz i to jest cała sztuczka.
 *
 * 3. **`uploads/` idą twardym dowiązaniem, nie kopią** (decyzja MG z 05.09:
 *    „każda kopia samowystarczalna"). Katalog kopii wygląda i zachowuje się jak
 *    komplet plików, ale 14 MB grafik nie mnoży się przez dwadzieścia cztery —
 *    dowiązanie to ten sam blok na dysku pod drugą nazwą. Jest to bezpieczne
 *    **wyłącznie dlatego, że plik w `uploads/` jest niezmienny**: trasy
 *    `/api/uploads/*` zapisują go raz pod losową nazwą i nigdy nie nadpisują.
 *    Gdyby kiedykolwiek zaczęły pisać w miejscu, dowiązania trzeba zamienić na
 *    kopie, bo inaczej zmiana pliku zmieni go we wszystkich kopiach naraz.
 */

/** Plik bazy wewnątrz katalogu kopii — zawsze pod tą samą nazwą. */
export const SNAPSHOT_DB_FILE = 'db.sqlite';
/** Katalog z dowiązanymi plikami `uploads/`. */
export const SNAPSHOT_UPLOADS_DIR = 'uploads';
/** Nagłówek kopii; czytany przez `archive:list` i przez `restore`. */
export const SNAPSHOT_MANIFEST_FILE = 'manifest.json';

/** Po co ta kopia powstała — do wiersza w panelu i do logu. */
export type SnapshotReason = 'start' | 'timer' | 'gm' | 'restore';

export interface SnapshotManifest {
  name: string;
  takenAt: string;
  reason: SnapshotReason;
  dbBytes: number;
  files: number;
  /** Czy pliki są dowiązaniami (tanio), czy prawdziwymi kopiami (drogo). */
  linked: boolean;
}

export interface SnapshotPaths {
  /** Plik bazy, którego kopię robimy (bezwzględny). */
  databaseFile: string;
  /** Katalog `uploads/` (bezwzględny). */
  uploadsDir: string;
  /** Katalog, w którym leżą kopie (bezwzględny). */
  backupDir: string;
}

/**
 * Ścieżka pliku bazy z `DATABASE_URL`.
 *
 * `file:./dev.db` rozwiązuje się **względem katalogu roboczego procesu**, bo tak
 * robi to sterownik better-sqlite3 pod Prismą — a nie względem katalogu schematu,
 * jak sugerowałaby dokumentacja Prisma CLI. Dlatego w repozytorium leżą dwa
 * pliki `dev.db`: żywy w `packages/server/`, i pusty artefakt migracji
 * w `packages/server/prisma/`.
 */
export function databaseFileFromUrl(url: string, cwd = process.cwd()): string {
  const withoutScheme = url.startsWith('file:') ? url.slice('file:'.length) : url;
  return resolve(cwd, withoutScheme);
}

/** Wszystkie pliki pod `dir`, ścieżkami względnymi; brak katalogu = pusta lista. */
async function listFilesUnder(dir: string, prefix = ''): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(dir, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...(await listFilesUnder(dir, rel)));
    else if (entry.isFile()) found.push(rel);
  }
  return found;
}

/**
 * Migawka bazy przez `VACUUM INTO`.
 *
 * Baza otwierana jest tylko do odczytu; `VACUUM INTO` mimo to działa, bo pisze
 * do **nowego** pliku, a nie do otwartej bazy. Cel musi nie istnieć — SQLite
 * odmawia nadpisania.
 */
export function vacuumInto(databaseFile: string, targetFile: string): void {
  const db = new DatabaseSync(databaseFile, { readOnly: true });
  try {
    // Ścieżka jedzie w SQL-u, więc apostrof w nazwie katalogu musi się podwoić.
    db.exec(`VACUUM INTO '${targetFile.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
}

/**
 * Dowiąż (a gdy się nie da — skopiuj) wszystkie pliki z `from` do `to`.
 * Zwraca liczbę plików i to, czy udało się użyć dowiązań.
 */
async function linkTree(from: string, to: string): Promise<{ files: number; linked: boolean }> {
  const names = await listFilesUnder(from);
  let linked = names.length > 0;
  for (const name of names) {
    const target = join(to, name);
    await mkdir(dirname(target), { recursive: true });
    try {
      await link(join(from, name), target);
    } catch {
      // Inny wolumin, system plików bez dowiązań, plik zniknął w międzyczasie —
      // kopia ma powstać mimo wszystko, bo to ona jest tu celem.
      await copyFile(join(from, name), target);
      linked = false;
    }
  }
  return { files: names.length, linked };
}

/**
 * Zrób kopię teraz. Zwraca wiersz do panelu MG.
 *
 * Dwie kopie w tej samej minucie dostałyby tę samą nazwę, więc druga **zastępuje**
 * pierwszą: nazwa niesie chwilę i ma dalej dać się przeczytać rotacji, a minuta
 * to i tak dokładność, w której nic się przy stole nie zmienia.
 */
export async function takeSnapshot(
  paths: SnapshotPaths,
  reason: SnapshotReason,
  now = new Date(),
): Promise<SnapshotSummary> {
  const name = snapshotName(now);
  const dir = join(paths.backupDir, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  vacuumInto(paths.databaseFile, join(dir, SNAPSHOT_DB_FILE));
  const { files, linked } = await linkTree(paths.uploadsDir, join(dir, SNAPSHOT_UPLOADS_DIR));
  const dbBytes = (await stat(join(dir, SNAPSHOT_DB_FILE))).size;

  const manifest: SnapshotManifest = {
    name,
    takenAt: now.toISOString(),
    reason,
    dbBytes,
    files,
    linked,
  };
  await writeFile(join(dir, SNAPSHOT_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);

  return { name, takenAt: manifest.takenAt, dbBytes, files, rotated: snapshotDayOf(name) !== null };
}

/** Kopie leżące w katalogu, od najświeższej; nierozpoznane nazwy na końcu. */
export async function listSnapshots(backupDir: string): Promise<SnapshotSummary[]> {
  let entries;
  try {
    entries = await readdir(backupDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const summaries: SnapshotSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(backupDir, entry.name);
    let dbBytes = 0;
    try {
      dbBytes = (await stat(join(dir, SNAPSHOT_DB_FILE))).size;
    } catch {
      // Katalog bez bazy to nie kopia — pomijamy zamiast zgadywać.
      continue;
    }
    let files = 0;
    let takenAt = snapshotDateOf(entry.name)?.toISOString() ?? null;
    try {
      const raw = JSON.parse(
        await readFile(join(dir, SNAPSHOT_MANIFEST_FILE), 'utf8'),
      ) as Partial<SnapshotManifest>;
      if (typeof raw.files === 'number') files = raw.files;
      if (typeof raw.takenAt === 'string') takenAt = raw.takenAt;
    } catch {
      files = (await listFilesUnder(join(dir, SNAPSHOT_UPLOADS_DIR))).length;
    }
    summaries.push({
      name: entry.name,
      takenAt,
      dbBytes,
      files,
      rotated: snapshotDayOf(entry.name) !== null,
    });
  }
  // Rozpoznane od najświeższej, przemianowane ręką na końcu — te i tak zostają.
  return summaries.sort((a, b) => {
    if (a.rotated !== b.rotated) return a.rotated ? -1 : 1;
    return a.name < b.name ? 1 : a.name > b.name ? -1 : 0;
  });
}

/** Zdejmij z dysku kopie, których plan rotacji nie zatrzymuje. Zwraca usunięte. */
export async function rotateSnapshots(backupDir: string, rules: SnapshotRules): Promise<string[]> {
  const names = (await listSnapshots(backupDir)).map((entry) => entry.name);
  const plan = planSnapshotRotation(names, rules);
  for (const name of plan.drop) {
    await rm(join(backupDir, name), { recursive: true, force: true });
  }
  return plan.drop;
}

/** Kopia plus rotacja — jedno wywołanie, bo nigdy nie robi się jednego bez drugiego. */
export async function takeSnapshotAndRotate(
  paths: SnapshotPaths,
  rules: SnapshotRules,
  reason: SnapshotReason,
  now = new Date(),
): Promise<{ snapshot: SnapshotSummary; dropped: string[] }> {
  const snapshot = await takeSnapshot(paths, reason, now);
  const dropped = await rotateSnapshots(paths.backupDir, rules);
  return { snapshot, dropped };
}

/**
 * Timer kopii: jedna przy starcie serwera, potem co `intervalMs`.
 *
 * Kopia przy starcie jest tą, po którą sięga się najczęściej — łapie stan
 * **sprzed** sesji, czyli dokładnie to, co przez dwa miesiące robiła ręka
 * (`dev.db.bak-*`). Zwraca funkcję zatrzymującą; `intervalMs = 0` wyłącza
 * wszystko, także kopię startową (tak stoi w testach).
 */
export function startSnapshotSchedule(
  paths: SnapshotPaths,
  rules: SnapshotRules,
  intervalMs: number,
  log: FastifyBaseLogger,
): () => void {
  if (intervalMs <= 0) return () => undefined;

  const run = (reason: SnapshotReason): void => {
    void takeSnapshotAndRotate(paths, rules, reason)
      .then(({ snapshot, dropped }) => {
        log.info(
          { snapshot: snapshot.name, dbBytes: snapshot.dbBytes, dropped: dropped.length },
          'snapshot taken',
        );
      })
      .catch((error: unknown) => {
        // Kopia, która się nie udała, nie ma prawa zatrzymać stołu — ale ma
        // zostawić ślad, bo cisza tutaj znaczy „nie ma kopii" i nikt tego nie widzi.
        log.error({ err: error }, 'snapshot failed');
      });
  };

  run('start');
  const timer = setInterval(() => run('timer'), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

/* ------------------------------------------------------------------ */
/* Przywracanie — wyłącznie ze skryptu, przy zatrzymanym serwerze       */
/* ------------------------------------------------------------------ */

export class RestoreRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestoreRefused';
  }
}

/**
 * Czy bazy nikt teraz nie trzyma?
 *
 * Pytamy o to jedynym sposobem, który mówi prawdę: próbą wzięcia wyłącznej
 * blokady. Działający serwer zwróci `SQLITE_BUSY` i przywracanie się nie odbędzie
 * — bo nadpisanie pliku pod otwartym połączeniem daje bazę, której nikt nie umie
 * naprawić, a serwer i tak dopisze do niej swój `-wal`.
 */
export function databaseIsIdle(databaseFile: string): boolean {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(databaseFile);
    db.exec('BEGIN EXCLUSIVE');
    db.exec('ROLLBACK');
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

export interface RestoreResult {
  /** Kopia bezpieczeństwa stanu SPRZED przywrócenia — nazwa katalogu. */
  safetyCopy: string;
  dbBytes: number;
  /** Ile plików `uploads/` doszło z kopii (istniejące nie są ruszane). */
  filesRestored: number;
}

/**
 * Przywróć kopię o podanej nazwie. Serwer musi być zatrzymany.
 *
 * Trzy rzeczy dzieją się tu świadomie:
 *  - **najpierw kopia bezpieczeństwa** stanu bieżącego, pod nazwą, której
 *    rotacja nie rozpoznaje, więc nigdy jej nie skasuje;
 *  - **`-wal` i `-shm` idą do kosza** razem z bazą; zostawiony `-wal` dolałby do
 *    przywróconego pliku transakcje z przyszłości;
 *  - **pliki `uploads/` tylko się dokłada, nigdy nie kasuje.** Grafika wgrana po
 *    snapshocie zostaje na dysku jako sierota — i tak zbierze ją `uploads-gc`
 *    godzinę po tym, jak przestanie być przez cokolwiek wymieniana.
 */
export async function restoreSnapshot(
  paths: SnapshotPaths,
  name: string,
  now = new Date(),
): Promise<RestoreResult> {
  const source = join(paths.backupDir, name);
  const sourceDb = join(source, SNAPSHOT_DB_FILE);
  try {
    await access(sourceDb, constants.R_OK);
  } catch {
    throw new RestoreRefused(`Nie ma kopii „${name}" (brak ${SNAPSHOT_DB_FILE}).`);
  }
  if (!databaseIsIdle(paths.databaseFile)) {
    throw new RestoreRefused(
      'Bazę trzyma inny proces — zatrzymaj serwer (`pnpm dev`) i powtórz przywracanie.',
    );
  }

  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const safetyCopy = `przed-przywroceniem-${stamp}`;
  const safetyDir = join(paths.backupDir, safetyCopy);
  await mkdir(safetyDir, { recursive: true });
  vacuumInto(paths.databaseFile, join(safetyDir, SNAPSHOT_DB_FILE));
  await linkTree(paths.uploadsDir, join(safetyDir, SNAPSHOT_UPLOADS_DIR));

  await rm(`${paths.databaseFile}-wal`, { force: true });
  await rm(`${paths.databaseFile}-shm`, { force: true });
  await copyFile(sourceDb, paths.databaseFile);

  let filesRestored = 0;
  const sourceUploads = join(source, SNAPSHOT_UPLOADS_DIR);
  for (const rel of await listFilesUnder(sourceUploads)) {
    const target = join(paths.uploadsDir, rel);
    try {
      await access(target, constants.R_OK);
      continue;
    } catch {
      // Plik zniknął od czasu kopii — właśnie po to kopia trzyma pliki.
    }
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(sourceUploads, rel), target);
    filesRestored += 1;
  }

  return {
    safetyCopy,
    dbBytes: (await stat(paths.databaseFile)).size,
    filesRestored,
  };
}

/**
 * Trzy ścieżki kopii z konfiguracji serwera, albo `null` — gdy ten proces kopii
 * nie robi (testy dymne, patrz `BackupConfig`).
 */
export function snapshotPathsFor(config: ServerConfig): SnapshotPaths | null {
  if (!config.backups) return null;
  return {
    databaseFile: databaseFileFromUrl(config.databaseUrl),
    uploadsDir: config.uploadsDir,
    backupDir: config.backups.dir,
  };
}

/** Ścieżka względem katalogu roboczego — do zdania w konsoli, nie do logiki. */
export function shortPath(path: string): string {
  const rel = relative(process.cwd(), path);
  return rel && !rel.startsWith('..') ? rel : path;
}
