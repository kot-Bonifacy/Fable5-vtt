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

/**
 * Polish name of a status, or the id when the data does not know it (stage
 * 16h). Cards name statuses out loud — „Kurier — Nieprzytomny (Amunicja
 * usypiająca)" — and „unconscious" would be the registry leaking into the
 * table's language.
 */
export function statusName(registry: StatusRegistry, id: string): string {
  return registry.list.find((status) => status.id === id)?.name ?? id;
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
