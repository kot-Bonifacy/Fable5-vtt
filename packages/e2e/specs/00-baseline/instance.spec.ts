import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { CLIENT_BUILD_DIR, CLIENT_DIR, LOG_DIR, SERVER_URL } from '../../instance/paths.ts';
import { query, tableNames } from '../../fixtures/db.ts';

/**
 * Linia bazowa instancji (`testy.md` 6.1): build produkcyjny wstaje na pustej
 * bazie po `migrate deploy` i ma wszystko, czego stół potrzebuje bez ręcznych kroków.
 */
test.describe('@szybkie linia bazowa instancji', () => {
  test('serwer z dist/ odpowiada na /health', async ({ request }) => {
    const response = await request.get(`${SERVER_URL}/health`);
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  test('pusta baza: jedno konto MG z env, zero kampanii', () => {
    expect(tableNames()).toEqual(expect.arrayContaining(['User', 'Campaign', 'ChatMessage']));
    expect(query('SELECT name, role FROM User')).toEqual([{ name: 'MG', role: 'GM' }]);
    expect(query('SELECT id FROM Campaign')).toEqual([]);
  });

  test('kompendium z data/private: 66 umiejętności, nie 42 z próbki', async ({ request }) => {
    const login = await request.post('/api/auth/login', {
      data: { password: process.env.E2E_GM_PASSWORD },
    });
    expect(login.ok()).toBe(true);
    const data = (await (await request.get('/api/cpred/data')).json()) as { skills: unknown[] };
    expect(data.skills).toHaveLength(66);
  });

  test('skrypt kości jest włączony na instancji i widać to w logu', () => {
    const log = readFileSync(join(LOG_DIR, 'server.log'), 'utf8');
    expect(log).toContain('VTT_DICE_SCRIPT: dice are forced from');
  });

  test('hak __vttE2E jest w buildzie e2e i nie ma go w produkcyjnym', () => {
    const bundle = (dir: string) =>
      readdirSync(join(dir, 'assets'))
        .filter((file) => file.endsWith('.js'))
        .map((file) => readFileSync(join(dir, 'assets', file), 'utf8'))
        .join('\n');
    expect(bundle(CLIENT_BUILD_DIR)).toContain('__vttE2E');

    const prodDir = mkdtempSync(join(tmpdir(), 'vtt-prod-build-'));
    try {
      const vite = join(CLIENT_DIR, 'node_modules/vite/bin/vite.js');
      const build = spawnSync(
        process.execPath,
        [vite, 'build', '--outDir', prodDir, '--emptyOutDir'],
        { cwd: CLIENT_DIR, encoding: 'utf8', windowsHide: true },
      );
      expect(build.status, build.stderr).toBe(0);
      expect(bundle(prodDir)).not.toContain('__vttE2E');
    } finally {
      rmSync(prodDir, { recursive: true, force: true });
    }
  });
});
