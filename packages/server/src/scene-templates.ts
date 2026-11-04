import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { readSceneTemplate, type SceneTemplate } from '@vtt/shared';
import type { ServerConfig } from './config.js';

/**
 * Wzorce scen z `data/public/scenes/<id>/scene.json` (etap 66).
 *
 * Czytane przy każdym otwarciu listy, nie raz przy starcie: pliki są małe,
 * MG otwiera listę rzadko, a nowy wzorzec po `git pull` widać bez restartu.
 * Zepsuty plik nie zatrzymuje reszty — wypada z listy z wpisem w dzienniku.
 */

/** Katalog wzorców: `sceneTemplatesDir` z konfiguracji albo `<dataPublicDir>/scenes`. */
export function sceneTemplatesRoot(
  config: Pick<ServerConfig, 'dataPublicDir' | 'sceneTemplatesDir'>,
): string {
  return config.sceneTemplatesDir ?? join(config.dataPublicDir, 'scenes');
}

export async function loadSceneTemplates(
  root: string,
  log?: Pick<FastifyBaseLogger, 'warn'>,
): Promise<SceneTemplate[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const templates: SceneTemplate[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const template = await loadSceneTemplate(root, entry.name, log);
    if (template) templates.push(template);
  }
  return templates.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

/** Jeden wzorzec po id (nazwie katalogu) albo `null`. */
export async function loadSceneTemplate(
  root: string,
  id: string,
  log?: Pick<FastifyBaseLogger, 'warn'>,
): Promise<SceneTemplate | null> {
  // Id idzie z gniazda — `readSceneTemplate` i tak go sprawdza, ale ścieżka
  // na dysku powstaje wcześniej, więc najpierw wzorzec nazwy.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(root, id, 'scene.json'), 'utf8'));
  } catch {
    return null;
  }
  const template = readSceneTemplate(raw, id);
  if (!template) log?.warn({ templateId: id }, 'scene template rejected — check scene.json');
  return template;
}
