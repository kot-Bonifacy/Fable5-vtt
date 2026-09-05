/**
 * Przywrócenie kopii zapasowej (etap 33) — **przy zatrzymanym serwerze**.
 *
 *   pnpm --filter @vtt/server restore -- snapshot-2026-09-05-1430
 *   pnpm --filter @vtt/server restore            # sama lista kopii
 *
 * Świadomie nie ma tego w UI. Przywrócenie kasuje bieżący stan, a guzik obok
 * „Zapisz" to za mała odległość od czegoś, czego nic nie cofa — dlatego robi się
 * to ręką, w konsoli, z nazwą kopii wpisaną na piechotę.
 *
 * Bezpieczniki są trzy i wszystkie siedzą w `restoreSnapshot`:
 *  - odmowa, gdy bazę trzyma inny proces (próba wyłącznej blokady SQLite),
 *  - kopia bezpieczeństwa stanu **sprzed** przywrócenia, pod nazwą, której
 *    rotacja nie rozpoznaje — więc nigdy jej nie skasuje,
 *  - pliki `uploads/` tylko się dokłada, nigdy nie kasuje.
 */
import { formatArchiveBytes } from '@vtt/shared';
import { loadConfig } from '../src/config.js';
import {
  listSnapshots,
  RestoreRefused,
  restoreSnapshot,
  shortPath,
  snapshotPathsFor,
} from '../src/snapshots.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const paths = snapshotPathsFor(config);
  if (!paths) {
    console.error('Kopie są wyłączone w konfiguracji (brak BACKUP_DIR).');
    process.exitCode = 1;
    return;
  }

  const name = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
  const snapshots = await listSnapshots(paths.backupDir);

  if (!name) {
    console.log(`${shortPath(paths.backupDir)} — ${snapshots.length} kopii:`);
    for (const entry of snapshots) {
      console.log(
        `  ${entry.name.padEnd(28)} ${formatArchiveBytes(entry.dbBytes).padStart(8)}  ${entry.files} plików`,
      );
    }
    console.log('\nPodaj nazwę kopii: pnpm --filter @vtt/server restore -- <nazwa>');
    return;
  }

  try {
    const result = await restoreSnapshot(paths, name);
    console.log(`Przywrócono ${name}.`);
    console.log(`  baza: ${shortPath(paths.databaseFile)} (${formatArchiveBytes(result.dbBytes)})`);
    console.log(`  pliki dołożone do uploads/: ${result.filesRestored}`);
    console.log(`  stan sprzed przywrócenia leży w: ${result.safetyCopy}`);
  } catch (error) {
    if (error instanceof RestoreRefused) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

await main();
