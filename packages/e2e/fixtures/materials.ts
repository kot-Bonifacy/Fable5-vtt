import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { E2E_DIR, MATERIALS_DIR } from '../instance/paths.ts';

/**
 * Mapy i portrety MG spoza repozytorium (`testy.md` 4.6). Suita wgrywa je przez
 * UI do `.e2e/uploads` — nigdy nie kopiuje do repo. Brak katalogu = test się
 * pomija z powodem, zamiast paść.
 */
export function material(relative: string): string {
  const path = join(MATERIALS_DIR, relative);
  test.skip(!existsSync(path), `brak materiału ${path} (VTT_E2E_MATERIALS)`);
  return path;
}

/**
 * Kopia materiału pod inną nazwą w `.e2e/tmp` — nazwa pliku portretu staje się
 * jego nazwą w puli MG, więc tak powstaje portret-kanarek.
 */
export function materialAs(relative: string, fileName: string): string {
  const source = material(relative);
  const dir = join(E2E_DIR, 'tmp');
  mkdirSync(dir, { recursive: true });
  const target = join(dir, fileName);
  copyFileSync(source, target);
  return target;
}
