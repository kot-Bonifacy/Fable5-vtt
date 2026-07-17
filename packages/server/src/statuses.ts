import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { StatusDefinition } from '@vtt/shared';

/**
 * Data-driven token status registry. The definitions (id, PL name, icon path)
 * live in `data/public/cpred/statuses.json` — the core stays system-agnostic
 * and only validates ids against whatever the data declares.
 */
export interface StatusRegistry {
  list: StatusDefinition[];
  ids: ReadonlySet<string>;
}

export const EMPTY_STATUS_REGISTRY: StatusRegistry = { list: [], ids: new Set() };

export async function loadStatusRegistry(
  dataPublicDir: string,
  log: FastifyBaseLogger,
): Promise<StatusRegistry> {
  const file = join(dataPublicDir, 'cpred', 'statuses.json');
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { statuses?: unknown };
    const list = (Array.isArray(parsed.statuses) ? parsed.statuses : []).filter(
      (entry): entry is StatusDefinition =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as StatusDefinition).id === 'string' &&
        typeof (entry as StatusDefinition).name === 'string' &&
        typeof (entry as StatusDefinition).icon === 'string',
    );
    return { list, ids: new Set(list.map((s) => s.id)) };
  } catch (error) {
    // Missing data must not take the VTT down — tokens just have no statuses.
    log.warn({ err: error, file }, 'status registry not loaded');
    return EMPTY_STATUS_REGISTRY;
  }
}
