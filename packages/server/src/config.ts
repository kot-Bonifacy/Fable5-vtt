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
    // Default assumes cwd = packages/server (dev scripts) → repo-root uploads/.
    uploadsDir: resolve(env.UPLOADS_DIR ?? '../../uploads'),
  };
}
