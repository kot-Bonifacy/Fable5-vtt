import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import {
  EMPTY_CPRED_REGISTRY,
  buildCpredRegistry,
  withCreationData,
  withLifepathData,
  withNetrunningData,
  type CpredRegistry,
} from '@vtt/shared';

/**
 * Loads the CP RED data files (skills, roles, character creation).
 *
 * Two directories, same rule as the compendium: `data/public/cpred/` ships a
 * sample of the skill list so a fresh clone has a usable sheet, and
 * `data/private/cpred/` holds the full 66-skill list imported from the
 * rulebook (stage 13), which is gitignored. A private file *replaces* its
 * public counterpart rather than merging with it — the skill list has to be
 * exactly what the group plays with, and a merge would leave stale rows
 * behind. Sheets store `skillId -> level` and skip untrained skills, so
 * swapping the list adds rows at 0 without touching any character.
 *
 * `creation.json` (stage 25a), `lifepath.json` (stage 25b) and
 * `netrunning.json` (stage 26a) follow the same two-directory rule and are the
 * only files here that may legitimately be missing: the creator, the sheet's
 * page two and the architecture generator then refuse at that step instead of
 * building something out of nothing.
 *
 * Z1 (26.09.2026, kryterium etapu 28): a server that fell back to the samples
 * for any file the rulebook import writes says so **once**, at startup, with
 * the list — on production that is 42 skills instead of 66, and silence made
 * it look like a working sheet. `roles.json` is not on the list: it ships only
 * with the repository, so warning about it would warn always.
 */
export async function loadCpredRegistry(
  dataPublicDir: string,
  dataPrivateDir: string,
  log: FastifyBaseLogger,
): Promise<CpredRegistry> {
  const fromSample: string[] = [];
  const load = async (name: string, fromRulebook: boolean) => {
    const file = await loadFile(dataPublicDir, dataPrivateDir, name, log);
    if (fromRulebook && !file.fromPrivate) fromSample.push(name);
    return file.loaded;
  };
  const skills = await load('skills.json', true);
  const roles = await load('roles.json', false);
  const creation = await load('creation.json', true);
  const lifepath = await load('lifepath.json', true);
  const netrunning = await load('netrunning.json', true);
  if (fromSample.length > 0) {
    log.warn(
      { files: fromSample, privateDir: join(dataPrivateDir, 'cpred') },
      'cpred rulebook data missing from data/private — running on the repo samples',
    );
  }
  if (skills === undefined && roles === undefined) return EMPTY_CPRED_REGISTRY;

  const registry = withNetrunningData(
    withLifepathData(withCreationData(buildCpredRegistry(skills, roles), creation), lifepath),
    netrunning,
  );
  if (registry.skills.length === 0) log.warn('cpred skills registry is empty');
  if (registry.creation !== null && registry.creation.roles.length === 0) {
    log.warn('cpred creation data has no roles');
  }
  if (registry.lifepath !== null && registry.lifepath.general.length === 0) {
    log.warn('cpred lifepath data has no general tables');
  }
  return registry;
}

async function loadFile(
  dataPublicDir: string,
  dataPrivateDir: string,
  name: string,
  log: FastifyBaseLogger,
): Promise<{ loaded: unknown; fromPrivate: boolean }> {
  // Private last so it wins; a missing private directory is the normal case.
  const paths = [join(dataPublicDir, 'cpred', name), join(dataPrivateDir, 'cpred', name)];
  let loaded: unknown;
  let fromPrivate = false;
  for (const [index, path] of paths.entries()) {
    try {
      loaded = JSON.parse(await readFile(path, 'utf8'));
      fromPrivate = index === 1;
    } catch (error) {
      // A malformed private file must not silently fall back to the samples:
      // the GM would see a shorter skill list and no reason why.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn({ err: error, path }, 'cpred data file skipped');
      }
    }
  }
  if (loaded === undefined) log.warn({ paths }, 'cpred data file not found');
  return { loaded, fromPrivate };
}
