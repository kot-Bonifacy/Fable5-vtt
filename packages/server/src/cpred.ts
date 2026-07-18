import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { EMPTY_CPRED_REGISTRY, buildCpredRegistry, type CpredRegistry } from '@vtt/shared';

/**
 * Loads the CP RED data files (skills, roles) from `data/public/cpred/`.
 * The server validates character sheets against whatever the data declares —
 * swapping the files for the full rulebook set (stage 12) needs no code change.
 */
export async function loadCpredRegistry(
  dataPublicDir: string,
  log: FastifyBaseLogger,
): Promise<CpredRegistry> {
  const dir = join(dataPublicDir, 'cpred');
  try {
    const [skillsRaw, rolesRaw] = await Promise.all([
      readFile(join(dir, 'skills.json'), 'utf8'),
      readFile(join(dir, 'roles.json'), 'utf8'),
    ]);
    const registry = buildCpredRegistry(JSON.parse(skillsRaw), JSON.parse(rolesRaw));
    if (registry.skills.length === 0) {
      log.warn({ dir }, 'cpred skills registry is empty');
    }
    return registry;
  } catch (error) {
    // Missing data must not take the VTT down — sheets just have no skill rows.
    log.warn({ err: error, dir }, 'cpred registry not loaded');
    return EMPTY_CPRED_REGISTRY;
  }
}
