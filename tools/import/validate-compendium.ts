/**
 * Step 3 of the compendium pipeline: validate the generated JSON against the
 * shared schemas before the server ever sees it.
 *
 * The Python importer writes JSON; this script is the TypeScript gate that
 * proves the files parse into the same registry the game uses at runtime, and
 * reports what was dropped and why.
 *
 *   pnpm --filter @vtt/server exec tsx ../../tools/import/validate-compendium.ts
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
// Relative import on purpose: this script sits outside the workspace packages,
// so the `@vtt/shared` alias is not resolvable from here.
import {
  buildCompendium,
  validateCompendiumEntry,
  type CompendiumFile,
} from '../../packages/shared/src/index.js';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIRS = [
  join(REPO_ROOT, 'data', 'public', 'cpred', 'compendium'),
  join(REPO_ROOT, 'data', 'private', 'cpred', 'compendium'),
];

async function readJsonFiles(dir: string): Promise<{ path: string; data: unknown }[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const files: { path: string; data: unknown }[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith('.json') || name === 'import-report.json') continue;
    const path = join(dir, name);
    files.push({ path, data: JSON.parse(await readFile(path, 'utf8')) });
  }
  return files;
}

async function main(): Promise<number> {
  let problems = 0;
  const all: unknown[] = [];

  for (const dir of DIRS) {
    const files = await readJsonFiles(dir);
    if (files.length === 0) {
      console.log(`(pusto) ${relative(REPO_ROOT, dir)}`);
      continue;
    }
    for (const { path, data } of files) {
      const file = data as CompendiumFile;
      const entries = file.entries ?? [];
      const rejected: string[] = [];
      for (const entry of entries) {
        const result = validateCompendiumEntry(entry);
        if (!result.ok) {
          problems += 1;
          const name = (entry as { name?: string }).name ?? '(bez nazwy)';
          rejected.push(
            `${name}: ${result.issues.map((i) => `${i.field} — ${i.message}`).join('; ')}`,
          );
        }
      }
      const label = relative(REPO_ROOT, path);
      console.log(
        `${label}: ${file.weaponTypes?.length ?? 0} typów broni, ${entries.length} wpisów` +
          (rejected.length ? `, ODRZUCONE ${rejected.length}` : ''),
      );
      for (const line of rejected) console.log(`   ✗ ${line}`);
      all.push(data);
    }
  }

  const registry = buildCompendium(all);
  console.log(
    `\nrazem: ${registry.weaponTypes.length} typów broni, ${registry.entries.length} wpisów`,
  );

  const missingTypes = registry.entries.filter(
    (entry) =>
      entry.category === 'weapon' &&
      entry.weaponTypeId !== null &&
      !registry.weaponTypeById.has(entry.weaponTypeId),
  );
  for (const entry of missingTypes) {
    problems += 1;
    console.log(`✗ ${entry.name}: nieznany typ broni`);
  }

  if (problems > 0) console.log(`\n${problems} problemów — popraw dane albo parser.`);
  else console.log('\nWszystkie wpisy przechodzą walidację.');
  return problems > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
