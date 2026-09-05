import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { snapshotName } from '@vtt/shared';
import {
  databaseFileFromUrl,
  databaseIsIdle,
  listSnapshots,
  restoreSnapshot,
  rotateSnapshots,
  SNAPSHOT_DB_FILE,
  SNAPSHOT_MANIFEST_FILE,
  SNAPSHOT_UPLOADS_DIR,
  takeSnapshot,
  takeSnapshotAndRotate,
  type SnapshotPaths,
} from './snapshots.js';

/**
 * Kopie zapasowe od strony dysku (etap 33).
 *
 * Bez Fastify i bez Prismy: to jest test pliku bazy, katalogu i rotacji, więc
 * baza jest tu najmniejsza, jaka wystarczy — jedna tabela z jednym wierszem.
 * Dzięki temu plik chodzi w kilkadziesiąt milisekund i nie potrzebuje
 * `beforeAll` z migracjami ani podniesionego limitu czasu.
 */

let root: string;
let paths: SnapshotPaths;

function writeRow(value: string): void {
  const db = new DatabaseSync(paths.databaseFile);
  db.exec('CREATE TABLE IF NOT EXISTS stan (v TEXT)');
  db.exec('DELETE FROM stan');
  db.prepare('INSERT INTO stan (v) VALUES (?)').run(value);
  db.close();
}

function readRow(file: string): string | undefined {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return (db.prepare('SELECT v FROM stan').get() as { v: string } | undefined)?.v;
  } finally {
    db.close();
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vtt-snap-'));
  paths = {
    databaseFile: join(root, 'dev.db'),
    uploadsDir: join(root, 'uploads'),
    backupDir: join(root, 'backups'),
  };
  mkdirSync(join(paths.uploadsDir, 'maps'), { recursive: true });
  writeFileSync(join(paths.uploadsDir, 'maps', 'plan.png'), 'udawana-mapa');
  writeRow('przed');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('takeSnapshot', () => {
  it('odkłada spójną bazę, pliki i manifest', async () => {
    const summary = await takeSnapshot(paths, 'gm');
    const dir = join(paths.backupDir, summary.name);

    expect(readRow(join(dir, SNAPSHOT_DB_FILE))).toBe('przed');
    expect(readFileSync(join(dir, SNAPSHOT_UPLOADS_DIR, 'maps', 'plan.png'), 'utf8')).toBe(
      'udawana-mapa',
    );
    const manifest = JSON.parse(readFileSync(join(dir, SNAPSHOT_MANIFEST_FILE), 'utf8')) as {
      reason: string;
      files: number;
    };
    expect(manifest).toMatchObject({ reason: 'gm', files: 1 });
    expect(summary.dbBytes).toBeGreaterThan(0);
    expect(summary.rotated).toBe(true);
  });

  it('nie potrzebuje zatrzymania bazy — pisze przy otwartym połączeniu', async () => {
    const held = new DatabaseSync(paths.databaseFile);
    try {
      const summary = await takeSnapshot(paths, 'timer');
      expect(readRow(join(paths.backupDir, summary.name, SNAPSHOT_DB_FILE))).toBe('przed');
    } finally {
      held.close();
    }
  });

  it('druga kopia w tej samej minucie zastępuje pierwszą', async () => {
    const at = new Date(2026, 8, 5, 14, 30);
    await takeSnapshot(paths, 'gm', at);
    writeRow('po');
    const second = await takeSnapshot(paths, 'gm', at);

    expect((await listSnapshots(paths.backupDir)).map((entry) => entry.name)).toEqual([
      second.name,
    ]);
    expect(readRow(join(paths.backupDir, second.name, SNAPSHOT_DB_FILE))).toBe('po');
  });
});

describe('listSnapshots', () => {
  it('pomija to, co kopią nie jest, i kładzie przemianowane na końcu', async () => {
    await takeSnapshot(paths, 'gm', new Date(2026, 8, 5, 10, 0));
    await takeSnapshot(paths, 'gm', new Date(2026, 8, 5, 11, 0));
    // Katalog bez bazy i luźny plik obok kopii — jedno i drugie leży dziś
    // w `data/private/backups/` (ręczne zrzuty kart z sierpnia).
    mkdirSync(join(paths.backupDir, 'smieci'), { recursive: true });
    writeFileSync(join(paths.backupDir, 'characters-2026-09-02.json'), '[]');
    // Kopia przemianowana ręką — rotacja jej nie rusza, lista ma ją pokazać.
    mkdirSync(join(paths.backupDir, 'przed-refaktorem'), { recursive: true });
    writeFileSync(join(paths.backupDir, 'przed-refaktorem', SNAPSHOT_DB_FILE), 'x');

    const list = await listSnapshots(paths.backupDir);
    expect(list.map((entry) => entry.name)).toEqual([
      'snapshot-2026-09-05-1100',
      'snapshot-2026-09-05-1000',
      'przed-refaktorem',
    ]);
    expect(list.at(-1)?.rotated).toBe(false);
  });

  it('nieistniejący katalog to pusta lista, nie wyjątek', async () => {
    expect(await listSnapshots(join(root, 'nie-ma-takiego'))).toEqual([]);
  });
});

describe('rotateSnapshots', () => {
  it('kasuje najstarszą kopię, gdy okno godzinowe się przepełni', async () => {
    const base = new Date(2026, 8, 5, 8, 0);
    for (let hour = 0; hour < 4; hour += 1) {
      await takeSnapshot(paths, 'timer', new Date(base.getTime() + hour * 3_600_000));
    }
    const dropped = await rotateSnapshots(paths.backupDir, { keepHourly: 2, keepDaily: 0 });

    expect(dropped).toEqual(['snapshot-2026-09-05-0800', 'snapshot-2026-09-05-0900']);
    expect((await listSnapshots(paths.backupDir)).map((entry) => entry.name)).toEqual([
      'snapshot-2026-09-05-1100',
      'snapshot-2026-09-05-1000',
    ]);
  });

  it('kopia z ręcznie zmienioną nazwą przeżywa każdą rotację', async () => {
    await takeSnapshot(paths, 'timer', new Date(2026, 8, 5, 8, 0));
    mkdirSync(join(paths.backupDir, 'przed-refaktorem'), { recursive: true });
    writeFileSync(join(paths.backupDir, 'przed-refaktorem', SNAPSHOT_DB_FILE), 'x');

    await rotateSnapshots(paths.backupDir, { keepHourly: 0, keepDaily: 0 });
    expect((await listSnapshots(paths.backupDir)).map((entry) => entry.name)).toEqual([
      'przed-refaktorem',
    ]);
  });

  it('takeSnapshotAndRotate robi jedno i drugie za jednym razem', async () => {
    await takeSnapshot(paths, 'timer', new Date(2026, 8, 5, 8, 0));
    const { snapshot, dropped } = await takeSnapshotAndRotate(
      paths,
      { keepHourly: 1, keepDaily: 0 },
      'timer',
      new Date(2026, 8, 5, 9, 0),
    );
    expect(snapshot.name).toBe('snapshot-2026-09-05-0900');
    expect(dropped).toEqual(['snapshot-2026-09-05-0800']);
  });
});

describe('restoreSnapshot', () => {
  it('wraca do stanu z kopii i zostawia stan sprzed przywrócenia', async () => {
    const snapshot = await takeSnapshot(paths, 'gm');
    writeRow('po');
    expect(readRow(paths.databaseFile)).toBe('po');

    const result = await restoreSnapshot(paths, snapshot.name);

    expect(readRow(paths.databaseFile)).toBe('przed');
    expect(readRow(join(paths.backupDir, result.safetyCopy, SNAPSHOT_DB_FILE))).toBe('po');
    // Kopia bezpieczeństwa ma nazwę spoza schematu — rotacja jej nie tknie.
    expect(result.safetyCopy.startsWith('przed-przywroceniem-')).toBe(true);
  });

  it('dokłada skasowany plik z uploads, ale nie rusza tych, które już są', async () => {
    const snapshot = await takeSnapshot(paths, 'gm');
    rmSync(join(paths.uploadsDir, 'maps', 'plan.png'));
    writeFileSync(join(paths.uploadsDir, 'maps', 'nowa.png'), 'wgrana-po-kopii');

    const result = await restoreSnapshot(paths, snapshot.name);

    expect(result.filesRestored).toBe(1);
    expect(readFileSync(join(paths.uploadsDir, 'maps', 'plan.png'), 'utf8')).toBe('udawana-mapa');
    // Grafika wgrana po kopii zostaje — kasowanie plików zostawiamy `uploads-gc`.
    expect(readFileSync(join(paths.uploadsDir, 'maps', 'nowa.png'), 'utf8')).toBe(
      'wgrana-po-kopii',
    );
  });

  it('odmawia kopii, której nie ma', async () => {
    await expect(restoreSnapshot(paths, 'snapshot-2020-01-01-0000')).rejects.toThrow(
      /Nie ma kopii/,
    );
  });

  it('odmawia, gdy bazę trzyma ktoś inny', async () => {
    const snapshot = await takeSnapshot(paths, 'gm');
    const held = new DatabaseSync(paths.databaseFile);
    held.exec('BEGIN EXCLUSIVE');
    try {
      expect(databaseIsIdle(paths.databaseFile)).toBe(false);
      await expect(restoreSnapshot(paths, snapshot.name)).rejects.toThrow(/zatrzymaj serwer/i);
    } finally {
      held.exec('ROLLBACK');
      held.close();
    }
    expect(databaseIsIdle(paths.databaseFile)).toBe(true);
  });
});

describe('databaseFileFromUrl', () => {
  it('rozwiązuje `file:./dev.db` względem katalogu roboczego', () => {
    // `resolve`, nie `join`: pod Windows ścieżka bezwzględna dostaje jeszcze
    // literę dysku, więc porównanie z samym `join` padałoby tylko tutaj.
    expect(databaseFileFromUrl('file:./dev.db', '/srv/vtt')).toBe(resolve('/srv/vtt', 'dev.db'));
    expect(databaseFileFromUrl('./dev.db', '/srv/vtt')).toBe(resolve('/srv/vtt', 'dev.db'));
  });
});

describe('nazwa kopii', () => {
  it('jest tą samą nazwą, którą liczy rotacja w `shared`', async () => {
    const at = new Date(2026, 8, 5, 14, 30);
    const summary = await takeSnapshot(paths, 'gm', at);
    expect(summary.name).toBe(snapshotName(at));
  });
});
