import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import {
  EMPTY_COMPENDIUM,
  buildCompendium,
  parseWeaponIcons,
  withWeaponIcons,
  type CompendiumRegistry,
  type CpredWeaponIcon,
} from '@vtt/shared';

/**
 * Loads the item compendium from JSON files (stage 13).
 *
 * Two directories, in order: `data/public/cpred/compendium` ships invented
 * sample entries with the repository, `data/private/cpred/compendium` holds
 * whatever the group imported from their own rulebook material and is
 * gitignored. Private files are read last, so they win on id collisions — and
 * a fresh clone without them still starts, just with the samples.
 */
export async function loadCompendium(
  dataPublicDir: string,
  dataPrivateDir: string,
  log: FastifyBaseLogger,
): Promise<CompendiumRegistry> {
  const dirs = [
    join(dataPublicDir, 'cpred', 'compendium'),
    join(dataPrivateDir, 'cpred', 'compendium'),
  ];
  const files: unknown[] = [];

  for (const dir of dirs) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue; // Missing directory is normal: private data is optional.
    }
    for (const name of names.sort()) {
      // The importers' reports sit next to the data but are not data itself.
      if (!name.endsWith('.json') || name.startsWith('import-report')) continue;
      try {
        files.push(JSON.parse(await readFile(join(dir, name), 'utf8')));
      } catch (error) {
        log.warn({ err: error, file: join(dir, name) }, 'compendium file skipped');
      }
    }
  }

  if (files.length === 0) {
    log.warn({ dirs }, 'compendium is empty');
    return EMPTY_COMPENDIUM;
  }
  const registry = withWeaponIcons(
    buildCompendium(files),
    await loadWeaponIcons(dataPublicDir, dataPrivateDir, log),
  );
  log.info(
    { weaponTypes: registry.weaponTypes.length, entries: registry.entries.length },
    'compendium loaded',
  );
  return registry;
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
