import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Wszystko, czego dotyka instancja E2E (`testy.md` 4.1). **Nigdy** `dev.db` ani
 * `uploads/` MG: baza leży obok (`packages/server/e2e.db`, łapie się na `*.db`
 * w `.gitignore`), a reszta stanu w `.e2e/` w korzeniu repozytorium.
 */
export const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const SERVER_DIR = join(REPO_DIR, 'packages/server');
export const CLIENT_DIR = join(REPO_DIR, 'packages/client');

export const E2E_DIR = join(REPO_DIR, '.e2e');
export const UPLOADS_DIR = join(E2E_DIR, 'uploads');
export const BACKUP_DIR = join(E2E_DIR, 'backups');
export const CHECKPOINT_DIR = join(E2E_DIR, 'checkpoints');
export const LOG_DIR = join(E2E_DIR, 'logs');
export const CLIENT_BUILD_DIR = join(E2E_DIR, 'client-dist');
export const STATE_FILE = join(E2E_DIR, 'instance.json');
export const DICE_SCRIPT_FILE = join(E2E_DIR, 'dice-script.txt');
export const BOT_DECISION_LOG = join(E2E_DIR, 'bot-decisions.jsonl');

/** `DATABASE_URL` rozwiązuje się względem katalogu roboczego serwera (`snapshots.ts`). */
export const DATABASE_URL = 'file:./e2e.db';
export const DATABASE_FILE = join(SERVER_DIR, 'e2e.db');

/** Grafika stołu spoza repo (mapa powitalna) — kopiowana do instancji, tylko do odczytu. */
export const MG_ART_DIR = join(REPO_DIR, 'uploads/art');

/** Kompendium z podręcznika — prawdziwe, tylko do odczytu (beta gra na nim). */
export const DATA_PRIVATE_DIR = join(REPO_DIR, 'data/private');

/** 3001 i 5173 zostają dla `pnpm dev` MG. */
export const SERVER_PORT = 3101;
/** Pośrednik TCP do AI Gatewaya (T5b: pad gatewaya w trakcie tury bota). */
export const GATEWAY_PROXY_PORT = 3108;
export const CLIENT_PORT = 4173;
/** Inspektor Node serwera instancji (T7c: sterta serwera), tylko na 127.0.0.1. */
export const SERVER_INSPECT_PORT = 9339;
export const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
export const BASE_URL = `http://localhost:${CLIENT_PORT}`;

/** Mapy i portrety MG (`testy.md` 4.6) — wgrywane przez UI, nigdy do repo. */
export const MATERIALS_DIR = process.env.VTT_E2E_MATERIALS ?? 'C:/AI/materialy';
