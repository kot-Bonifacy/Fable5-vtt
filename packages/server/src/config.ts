import { resolve } from 'node:path';

export interface ServerConfig {
  port: number;
  host: string;
  clientOrigin: string;
  databaseUrl: string;
  gmName: string;
  gmPassword: string | undefined;
  cookieSecret: string;
  sessionTtlDays: number;
  /** Absolute directory for user uploads (maps, tokens, handouts). */
  uploadsDir: string;
  /** Absolute directory of committed public data (status icons, samples). */
  dataPublicDir: string;
  /** Base URL of the Python AI gateway (localhost in dev, tailnet address in prod). */
  aiGatewayUrl: string;
  /** Shared secret sent as X-API-Key; empty disables the header (local dev). */
  aiGatewayApiKey: string;
  /** How often the server polls the gateway for bot availability. */
  aiHealthIntervalMs: number;
  /** Hard cap on a single generation before the server gives up. */
  aiRequestTimeoutMs: number;
  /** Hard cap on synthesizing one bot line; on timeout the line goes without audio. */
  ttsTimeoutMs: number;
  /** Cached bot audio is swept down to this size after every write. */
  ttsCacheMaxBytes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 3001),
    host: env.HOST ?? '127.0.0.1',
    clientOrigin: env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    databaseUrl: env.DATABASE_URL ?? 'file:./dev.db',
    gmName: env.GM_NAME ?? 'MG',
    gmPassword: env.GM_PASSWORD,
    cookieSecret: env.COOKIE_SECRET ?? 'dev-secret-change-me',
    sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 30),
    // Defaults assume cwd = packages/server (dev scripts) → repo-root dirs.
    uploadsDir: resolve(env.UPLOADS_DIR ?? '../../uploads'),
    dataPublicDir: resolve(env.DATA_PUBLIC_DIR ?? '../../data/public'),
    aiGatewayUrl: (env.AI_GATEWAY_URL ?? 'http://127.0.0.1:8100').replace(/\/$/, ''),
    aiGatewayApiKey: env.AI_GATEWAY_API_KEY ?? '',
    aiHealthIntervalMs: Number(env.AI_HEALTH_INTERVAL_MS ?? 10_000),
    aiRequestTimeoutMs: Number(env.AI_REQUEST_TIMEOUT_MS ?? 120_000),
    // Piper synthesizes 30 s of speech in ~0,5 s; 20 s is a wide safety margin
    // that still keeps a wedged gateway from holding a bot line hostage.
    ttsTimeoutMs: Number(env.TTS_TIMEOUT_MS ?? 20_000),
    ttsCacheMaxBytes: Number(env.TTS_CACHE_MAX_BYTES ?? 512 * 1024 * 1024),
  };
}
