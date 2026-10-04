import { spawn, spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import * as P from './paths.ts';

/**
 * Instancja E2E (`testy.md` 4.1): serwer z `dist/` (build produkcyjny, nie `tsx watch`)
 * i klient z `vite build --mode e2e` podany przez `vite preview`.
 *
 * Oba procesy startują **bez powłoki i bez `pnpm`** — `node` wprost — więc zabicie
 * PID-u zabija serwer, a nie tylko opakowanie (pułapka `testy`: sieroty `pnpm dev`
 * na Windows). PID-y leżą w `.e2e/instance.json`, żeby zatrzymać instancję mógł
 * każdy proces: `globalSetup`, pracownik testów (restart w T7) albo `instance/cli.ts`.
 */

interface InstanceState {
  serverPid?: number;
  clientPid?: number;
}

const NODE = process.execPath;
const PRISMA_CLI = join(P.SERVER_DIR, 'node_modules/prisma/build/index.js');
const TSX_CLI = join(P.SERVER_DIR, 'node_modules/tsx/dist/cli.mjs');
const VITE_CLI = join(P.CLIENT_DIR, 'node_modules/vite/bin/vite.js');
const TSUP_CLI = join(P.SERVER_DIR, 'node_modules/tsup/dist/cli-default.js');

/**
 * Hasło MG i sekret ciasteczka — losowe na przebieg, tylko w pamięci procesów testów.
 * Ustawione w `process.env` runnera przechodzą do pracowników Playwrighta.
 */
export function ensureSecrets(): { gmPassword: string; cookieSecret: string } {
  process.env.E2E_GM_PASSWORD ||= randomBytes(18).toString('base64url');
  process.env.E2E_COOKIE_SECRET ||= randomBytes(32).toString('base64url');
  return {
    gmPassword: process.env.E2E_GM_PASSWORD,
    cookieSecret: process.env.E2E_COOKIE_SECRET,
  };
}

/**
 * Środowisko bez niczego, co mogłoby skierować serwer na dane MG. Każda zmienna
 * serwera jest potem podana jawnie; `.env` z `packages/server` nie jest czytany.
 */
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      /^(DATABASE_URL|UPLOADS_DIR|BACKUP_|GM_|COOKIE_SECRET|DATA_P|AI_GATEWAY|BOT_DECISION_LOG|AUDIO_PYTHON|NODE_ENV|VTT_DICE_SCRIPT|PORT|HOST|CLIENT_ORIGIN|SESSION_TTL|RATE_LIMITS|TRUST_PROXY|VTT_SESSION|VTT_MAX_SESSIONS)/.test(
        key,
      )
    ) {
      delete env[key];
    }
  }
  return env;
}

function serverEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const { gmPassword, cookieSecret } = ensureSecrets();
  return {
    ...cleanEnv(),
    PORT: String(P.SERVER_PORT),
    HOST: '127.0.0.1',
    CLIENT_ORIGIN: P.BASE_URL,
    DATABASE_URL: P.DATABASE_URL,
    GM_NAME: P.GM_LOGIN,
    GM_PASSWORD: gmPassword,
    COOKIE_SECRET: cookieSecret,
    UPLOADS_DIR: P.UPLOADS_DIR,
    DATA_PUBLIC_DIR: join(P.REPO_DIR, 'data/public'),
    DATA_PRIVATE_DIR: process.env.E2E_DATA_PRIVATE_DIR ?? P.DATA_PRIVATE_DIR,
    BACKUP_DIR: P.BACKUP_DIR,
    // Kopia z harmonogramu tylko tam, gdzie test o nią prosi (6.9).
    BACKUP_INTERVAL_MINUTES: '0',
    BOT_DECISION_LOG: P.BOT_DECISION_LOG,
    AI_GATEWAY_URL: process.env.E2E_AI_GATEWAY_URL ?? 'http://127.0.0.1:8100',
    AI_GATEWAY_API_KEY: process.env.E2E_AI_GATEWAY_API_KEY ?? '',
    VTT_DICE_SCRIPT: P.DICE_SCRIPT_FILE,
    // Jak za Caddy na VPS: adres klienta z `X-Forwarded-For`. Przeglądarki suity
    // idą przez proxy `vite preview` bez tego nagłówka (adres 127.0.0.1), a test
    // limitu logowania (6.2.11, #12) zgaduje hasło z „obcego” adresu w nagłówku —
    // inaczej zablokowałby na 15 minut logowanie MG całej reszcie suity.
    TRUST_PROXY: '1',
    // Etap 44c: zegar bezczynności sesji ma progi produkcyjne 15 min / 3 h,
    // a pełny przebieg trwa ~40 min i potrafi zostawić kampanię bez gniazda na
    // dłużej niż kwadrans (np. A czeka, gdy T9a gra przy B). Progi sprawdza
    // `sessions.test.ts` na sztucznym zegarze; tu tylko nie mają przeszkadzać.
    VTT_SESSION_EMPTY_MINUTES: '600',
    VTT_SESSION_IDLE_MINUTES: '600',
    ...extra,
  };
}

function run(command: string, args: string[], options: SpawnSyncOptions): string {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} → ${result.status ?? result.error}\n${result.stdout}\n${result.stderr}`,
    );
  }
  return String(result.stdout);
}

/** Build serwera (tsup, jak na VPS) i klienta w trybie `e2e` do `.e2e/client-dist`. */
export function buildAll(): void {
  run(NODE, [TSUP_CLI], { cwd: P.SERVER_DIR });
  run(NODE, [VITE_CLI, 'build', '--mode', 'e2e', '--outDir', P.CLIENT_BUILD_DIR, '--emptyOutDir'], {
    cwd: P.CLIENT_DIR,
  });
}

/** `prisma migrate deploy` na bazie E2E — także na przywróconym punkcie ze starszym schematem. */
export function migrate(): void {
  run(NODE, [PRISMA_CLI, 'migrate', 'deploy'], {
    cwd: P.SERVER_DIR,
    env: { ...cleanEnv(), DATABASE_URL: P.DATABASE_URL },
  });
}

function removeDatabase(): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    rmSync(`${P.DATABASE_FILE}${suffix}`, { force: true });
  }
}

/** Pusta baza po migracjach i puste katalogi — tak wystartuje produkcja (decyzja MG z 26.09). */
export async function prepareFresh(): Promise<void> {
  await stopInstance();
  removeDatabase();
  for (const dir of [P.UPLOADS_DIR, P.BACKUP_DIR, P.LOG_DIR]) {
    rmSync(dir, { recursive: true, force: true });
  }
  rmSync(P.BOT_DECISION_LOG, { force: true });
  mkdirSync(P.UPLOADS_DIR, { recursive: true });
  // `uploads/art/` jedzie na VPS ręcznie, razem z resztą `uploads/` (etap 28,
  // `docs/assety-mapy.md`) — bez niego gracz na pustym stole dostaje 404 zamiast
  // mapy powitalnej. Instancja udaje produkcję po tym kroku; kopia, nie dowiązanie.
  if (existsSync(P.MG_ART_DIR)) {
    cpSync(P.MG_ART_DIR, join(P.UPLOADS_DIR, 'art'), { recursive: true });
  }
  migrate();
  writeFileSync(P.DICE_SCRIPT_FILE, '');
}

/**
 * Odtworzenie kopii **z harmonogramu serwera** (`.e2e/backups`, krok 6.9) na czystym
 * katalogu: bez bazy i bez uploadów, jak na nowej maszynie. Ten sam skrypt `restore`,
 * którym MG przywraca kopię ręcznie (`ArchivePanel`: „Zatrzymaj serwer i uruchom…”).
 */
export async function restoreBackup(name: string): Promise<void> {
  if (!existsSync(join(P.BACKUP_DIR, name, 'db.sqlite'))) {
    throw new Error(`E2E: no backup "${name}" in ${P.BACKUP_DIR}`);
  }
  await stopInstance();
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    rmSync(`${P.DATABASE_FILE}${suffix}`, { force: true });
  }
  rmSync(P.UPLOADS_DIR, { recursive: true, force: true });
  mkdirSync(P.UPLOADS_DIR, { recursive: true });
  migrate();
  serverScript('scripts/restore.ts', [name], P.BACKUP_DIR);
  migrate();
}

function readState(): InstanceState {
  try {
    return JSON.parse(readFileSync(P.STATE_FILE, 'utf8')) as InstanceState;
  } catch {
    return {};
  }
}

/** PID serwera instancji — T7b próbkuje jego pamięć i czas procesora. */
export function serverPid(): number | undefined {
  return readState().serverPid;
}

function writeState(state: InstanceState): void {
  mkdirSync(P.E2E_DIR, { recursive: true });
  writeFileSync(P.STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

async function responds(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function waitFor(check: () => Promise<boolean>, what: string, ms = 60_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`E2E: ${what} did not happen within ${ms} ms`);
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
  } else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Już nie żyje.
    }
  }
}

function launch(name: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): number {
  mkdirSync(P.LOG_DIR, { recursive: true });
  const log = openSync(join(P.LOG_DIR, `${name}.log`), 'a');
  const child = spawn(NODE, args, {
    cwd,
    env,
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  child.unref();
  if (!child.pid) throw new Error(`E2E: could not start ${name}`);
  return child.pid;
}

const serverUp = () => responds(`${P.SERVER_URL}/health`);
const clientUp = () => responds(P.BASE_URL);

export interface ServerOptions {
  /**
   * Inspektor Node na `127.0.0.1:9339` (`SERVER_INSPECT_PORT`) — T7c wymusza przez niego
   * GC i czyta stertę serwera (`fixtures/pomiary.ts`, `serverHeap`). Tylko lokalnie.
   */
  inspect?: boolean;
}

/** Sam serwer — osobno, bo T7 restartuje go w trakcie walki przy żywym kliencie. */
export async function startServer(
  extraEnv: NodeJS.ProcessEnv = {},
  options: ServerOptions = {},
): Promise<void> {
  if (await serverUp()) {
    throw new Error(
      `E2E: port ${P.SERVER_PORT} is taken — run \`pnpm --filter @vtt/e2e instance stop\``,
    );
  }
  const args = options.inspect
    ? [`--inspect=127.0.0.1:${P.SERVER_INSPECT_PORT}`, 'dist/main.js']
    : ['dist/main.js'];
  const serverPid = launch('server', args, P.SERVER_DIR, serverEnv(extraEnv));
  writeState({ ...readState(), serverPid });
  await waitFor(serverUp, 'server /health');
}

export async function stopServer(): Promise<void> {
  const state = readState();
  killTree(state.serverPid);
  writeState({ ...state, serverPid: undefined });
  await waitFor(async () => !(await serverUp()), 'server shutdown', 15_000);
}

export async function startInstance(
  extraEnv: NodeJS.ProcessEnv = {},
  options: ServerOptions = {},
): Promise<void> {
  await startServer(extraEnv, options);
  if (await clientUp()) {
    throw new Error(
      `E2E: port ${P.CLIENT_PORT} is taken — run \`pnpm --filter @vtt/e2e instance stop\``,
    );
  }
  const clientPid = launch(
    'client',
    [
      VITE_CLI,
      'preview',
      '--mode',
      'e2e',
      '--outDir',
      P.CLIENT_BUILD_DIR,
      '--port',
      String(P.CLIENT_PORT),
      '--strictPort',
      '--host',
      'localhost',
    ],
    P.CLIENT_DIR,
    { ...cleanEnv(), VTT_API_TARGET: P.SERVER_URL },
  );
  writeState({ ...readState(), clientPid });
  await waitFor(clientUp, 'client preview');
}

export async function stopInstance(): Promise<void> {
  const state = readState();
  killTree(state.clientPid);
  killTree(state.serverPid);
  rmSync(P.STATE_FILE, { force: true });
  if (state.clientPid || state.serverPid) {
    await waitFor(
      async () => !(await serverUp()) && !(await clientUp()),
      'instance shutdown',
      15_000,
    );
  }
}

/** Wymuszone ścianki następnych kości serwera (`VTT_DICE_SCRIPT`, `testy.md` 4.2). */
export function scriptDice(faces: number[]): void {
  writeFileSync(P.DICE_SCRIPT_FILE, faces.join(' '));
}

export function pendingDice(): string {
  return readFileSync(P.DICE_SCRIPT_FILE, 'utf8').trim();
}

// --- Punkty kontrolne (`testy.md` 4.4) ---------------------------------------
//
// Idą przez **prawdziwe** skrypty kopii serwera (`snapshot`, `restore`), więc każde
// przejście etapu T testuje kopię i odtworzenie na świeżym, rozegranym stanie.

function serverScript(script: string, args: string[] = [], backupDir = P.CHECKPOINT_DIR): string {
  return run(NODE, [TSX_CLI, script, ...args], {
    cwd: P.SERVER_DIR,
    env: {
      ...cleanEnv(),
      DATABASE_URL: P.DATABASE_URL,
      UPLOADS_DIR: P.UPLOADS_DIR,
      BACKUP_DIR: backupDir,
      // Rotacja nie ma tu nic do roboty — każda kopia od razu dostaje nazwę punktu.
      BACKUP_KEEP_HOURLY: '1000',
      BACKUP_KEEP_DAILY: '1000',
    },
  });
}

/** Kopia bieżącego stanu pod nazwą punktu (np. `po-T3`); działa przy żywym serwerze. */
export function saveCheckpoint(name: string): void {
  mkdirSync(P.CHECKPOINT_DIR, { recursive: true });
  const before = new Set(readdirSync(P.CHECKPOINT_DIR));
  serverScript('scripts/snapshot.ts');
  const created = readdirSync(P.CHECKPOINT_DIR).filter((entry) => !before.has(entry));
  if (created.length !== 1) {
    throw new Error(`E2E: expected one new snapshot, got ${JSON.stringify(created)}`);
  }
  const target = join(P.CHECKPOINT_DIR, name);
  rmSync(target, { recursive: true, force: true });
  renameSync(join(P.CHECKPOINT_DIR, created[0]!), target);
}

export function hasCheckpoint(name: string): boolean {
  return existsSync(join(P.CHECKPOINT_DIR, name, 'db.sqlite'));
}

/**
 * Odtworzenie punktu **na czystym katalogu uploadów** — przy zatrzymanej instancji,
 * jak każe `restore.ts`. Po odtworzeniu `migrate deploy`: punkt zapisany przed
 * nową migracją dalej się nadaje.
 */
export async function restoreCheckpoint(name: string): Promise<void> {
  if (!hasCheckpoint(name)) throw new Error(`E2E: no checkpoint "${name}" in ${P.CHECKPOINT_DIR}`);
  await stopInstance();
  rmSync(P.UPLOADS_DIR, { recursive: true, force: true });
  mkdirSync(P.UPLOADS_DIR, { recursive: true });
  if (!existsSync(P.DATABASE_FILE)) migrate();
  serverScript('scripts/restore.ts', [name]);
  for (const entry of readdirSync(P.CHECKPOINT_DIR)) {
    if (entry.startsWith('przed-przywroceniem-')) {
      rmSync(join(P.CHECKPOINT_DIR, entry), { recursive: true, force: true });
    }
  }
  migrate();
  writeFileSync(P.DICE_SCRIPT_FILE, '');
}
