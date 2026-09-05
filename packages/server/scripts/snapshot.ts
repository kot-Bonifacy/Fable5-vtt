/**
 * Kopia zapasowa z konsoli (etap 33).
 *
 *   pnpm --filter @vtt/server snapshot          # kopia + rotacja
 *   pnpm --filter @vtt/server snapshot -- --list  # co leży w katalogu kopii
 *
 * Działa i przy uruchomionym serwerze, i przy zatrzymanym: `VACUUM INTO` bierze
 * spójną migawkę bez wyłączania stołu. Ten sam kod chodzi na timerze w serwerze
 * — skrypt jest tu po to, żeby dało się zrobić kopię **przed** czymś ryzykownym,
 * nie czekając na pełną godzinę.
 *
 * Mieszka w `packages/server/scripts/`, a nie w `scripts/` w korzeniu, bo musi
 * czytać `loadConfig` i `@vtt/shared` — oba w TypeScripcie, oba uruchamiane
 * przez `tsx`, który stoi w zależnościach serwera.
 */
import { formatArchiveBytes } from '@vtt/shared';
import { loadConfig } from '../src/config.js';
import {
  listSnapshots,
  shortPath,
  snapshotPathsFor,
  takeSnapshotAndRotate,
} from '../src/snapshots.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const paths = snapshotPathsFor(config);
  if (!paths || !config.backups) {
    console.error('Kopie są wyłączone w konfiguracji (brak BACKUP_DIR).');
    process.exitCode = 1;
    return;
  }

  const listOnly = process.argv.includes('--list');
  if (!listOnly) {
    const { snapshot, dropped } = await takeSnapshotAndRotate(
      paths,
      { keepHourly: config.backups.keepHourly, keepDaily: config.backups.keepDaily },
      'gm',
    );
    console.log(
      `Kopia ${snapshot.name}: baza ${formatArchiveBytes(snapshot.dbBytes)}, ` +
        `${snapshot.files} plików z uploads/.`,
    );
    if (dropped.length) {
      console.log(`Rotacja zdjęła ${dropped.length}: ${dropped.join(', ')}`);
    }
  }

  const snapshots = await listSnapshots(paths.backupDir);
  console.log(`\n${shortPath(paths.backupDir)} — ${snapshots.length} kopii:`);
  for (const entry of snapshots) {
    const mark = entry.rotated ? ' ' : '*';
    console.log(
      `${mark} ${entry.name.padEnd(28)} ${formatArchiveBytes(entry.dbBytes).padStart(8)}  ` +
        `${entry.files} plików`,
    );
  }
  if (snapshots.some((entry) => !entry.rotated)) {
    console.log('\n* — nazwa spoza schematu; rotacja takiej kopii nigdy nie skasuje.');
  }
}

await main();
