import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import {
  EMPTY_COMPENDIUM,
  buildCompendium,
  cpredScaleCatalogPrices,
  parseWeaponIcons,
  withWeaponIcons,
  type CompendiumRegistry,
  type CpredWeaponIcon,
} from '@vtt/shared';

/**
 * Loads the item compendium from JSON files (stage 13).
 *
 * Two directories: `data/public/cpred/compendium` ships invented sample
 * entries with the repository, `data/private/cpred/compendium` holds whatever
 * the group imported from their own rulebook material and is gitignored.
 * **One or the other, never both** (#5, 26.09.2026): the samples exist so that
 * a fresh clone starts, and next to the rulebook they were a shop shelf with
 * „Zgrzyt 9" beside real guns. A private directory with at least one readable
 * data file replaces the samples whole.
 */
export async function loadCompendium(
  dataPublicDir: string,
  dataPrivateDir: string,
  log: FastifyBaseLogger,
): Promise<CompendiumRegistry> {
  const dirs = [
    join(dataPrivateDir, 'cpred', 'compendium'),
    join(dataPublicDir, 'cpred', 'compendium'),
  ];
  let files: unknown[] = [];

  for (const [index, dir] of dirs.entries()) {
    files = await readCompendiumDir(dir, log);
    if (files.length === 0) continue;
    // Z1 (26.09.2026, kryterium etapu 28): on production the sample is a quiet
    // slide into invented gear, so the fallback is said out loud, once.
    if (index > 0) {
      log.warn(
        { privateDir: dirs[0] },
        'compendium missing from data/private — running on the repo sample',
      );
    }
    break;
  }

  if (files.length === 0) {
    log.warn({ dirs }, 'compendium is empty');
    return EMPTY_COMPENDIUM;
  }
  // Etap 47a: katalog z plików mówi cenami podręcznika, a stół płaci cennikiem
  // domowym. Przelicza się tu, raz — wpisy MG z bazy są już w nowej walucie.
  const registry = withWeaponIcons(
    cpredScaleCatalogPrices(buildCompendium(files)),
    await loadWeaponIcons(dataPublicDir, dataPrivateDir, log),
  );
  log.info(
    { weaponTypes: registry.weaponTypes.length, entries: registry.entries.length },
    'compendium loaded',
  );
  return registry;
}

/** Every data file of one compendium directory; a missing directory is empty. */
async function readCompendiumDir(dir: string, log: FastifyBaseLogger): Promise<unknown[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return []; // Missing directory is normal: private data is optional.
  }
  const files: unknown[] = [];
  for (const name of names.sort()) {
    // The importers' reports sit next to the data but are not data itself.
    if (!name.endsWith('.json') || name.startsWith('import-report')) continue;
    try {
      files.push(JSON.parse(await readFile(join(dir, name), 'utf8')));
    } catch (error) {
      log.warn({ err: error, file: join(dir, name) }, 'compendium file skipped');
    }
  }
  return files;
}

/**
 * `cpred/weapon-icons.json` (24.09.2026) — modele, którym sylwetka typu kłamie
 * (rewolwery). Te same dwa katalogi i ta sama kolejność, co przy
 * `shop-tiers.json`: publiczna próbka nazywa wymyślone wpisy, prywatny plik
 * grupy wygrywa po id. Brak obu jest normalny — broń rysuje wtedy swój typ.
 */
async function loadWeaponIcons(
  dataPublicDir: string,
  dataPrivateDir: string,
  log: FastifyBaseLogger,
): Promise<Record<string, CpredWeaponIcon>> {
  let icons: Record<string, CpredWeaponIcon> = {};
  for (const dir of [dataPublicDir, dataPrivateDir]) {
    const file = join(dir, 'cpred', 'weapon-icons.json');
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    try {
      const parsed = parseWeaponIcons(JSON.parse(raw));
      if (parsed.issues.length > 0) {
        log.warn({ file, issues: parsed.issues }, 'weapon icons: entries skipped');
      }
      icons = { ...icons, ...parsed.icons };
    } catch (error) {
      log.warn({ err: error, file }, 'weapon icons file skipped');
    }
  }
  return icons;
}
