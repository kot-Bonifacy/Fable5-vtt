import { resolve } from 'node:path';
import { SNAPSHOT_RULES_DEFAULT } from '@vtt/shared';

export interface ServerConfig {
  /** Optional Python executable with tools/audio/requirements.txt installed. */
  audioPython?: string;
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
  /** Absolute directory of gitignored rulebook-derived data; may not exist. */
  dataPrivateDir: string;
  /** Base URL of the Python AI gateway (localhost in dev, tailnet address in prod). */
  aiGatewayUrl: string;
  /** Shared secret sent as X-API-Key; empty disables the header (local dev). */
  aiGatewayApiKey: string;
  /** How often the server polls the gateway for bot availability. */
  aiHealthIntervalMs: number;
  /** Hard cap on a single generation before the server gives up. */
  aiRequestTimeoutMs: number;
  /**
   * Karencja AI właściciela (etap 44d): ile po zamknięciu ostatniej karty
   * właściciela „Udostępniam AI” gaśnie samo (`VTT_AI_OWNER_GRACE_SECONDS`,
   * decyzja MG: 2 min). Brak = 2 min (testy dymne).
   */
  aiOwnerGraceMs?: number;
  /**
   * Where the bots' decision log lands (stage 20a): one JSON line per decision,
   * prompt and raw answer included. Empty (or absent, as in tests) disables it —
   * the log carries GM notes and campaign secrets, so it stays a dev knob.
   */
  botDecisionLogPath?: string;
  /**
   * Kopie zapasowe (etap 33). Pole jest **opcjonalne i to jest jego sens**:
   * brak sekcji znaczy „ten proces kopii nie robi". Tak stoją wszystkie testy
   * dymne — żaden nie ma powodu odkładać na dysk migawki swojej bazy
   * tymczasowej, a osobna flaga „wyłącz" byłaby drugim sposobem na to samo.
   */
  backups?: BackupConfig;
  /**
   * Limity tempa (01.10, #12 i #13): złe hasła i zaproszenia per adres IP oraz
   * zdarzenia gniazda per konto. **Opcjonalne i domyślnie wyłączone w testach
   * dymnych** — tam jedno gniazdo wysyła setki zdarzeń w sekundę i ma do tego
   * prawo; `loadConfig` włącza je zawsze, chyba że `RATE_LIMITS=0`.
   */
  rateLimits?: boolean;
  /**
   * Adres klienta z `X-Forwarded-For` (Caddy na VPS, etap 28). Bez zaufanego
   * pośrednika włączenie tego pozwala podać dowolny adres i obejść limit
   * logowania, więc domyślnie wyłączone (`TRUST_PROXY=1` włącza).
   */
  trustProxy?: boolean;
  /**
   * Rejestracja nowych kont MG (etap 44a, `VTT_REGISTRATION=open|closed`).
   * Brak pola znaczy „otwarta” — tak jak domyślna wartość z env (decyzja MG
   * z 03.10), więc testy dymne nie muszą go podawać. `closed` to wyłącznik na
   * wypadek zalewu kont na publicznym VPS.
   */
  registrationOpen?: boolean;
  /**
   * Konto administratora (etap 53, `VTT_ADMIN_LOGIN` + `VTT_ADMIN_PASSWORD`).
   * Hasło służy **wyłącznie do założenia konta**: serwer zakłada je, gdy go nie
   * ma, z hasłem tymczasowym do zmiany przy pierwszym wejściu, i potem nigdy go
   * nie nadpisuje — inaczej niż `GM_PASSWORD`. Brak pól: konta admina nie ma
   * (tak stoją testy dymne, które go nie potrzebują).
   */
  adminLogin?: string;
  adminPassword?: string;
  /**
   * `VTT_ADMIN_RESET_PASSWORD=1` — awaryjne wyjście z zapomnianego hasła
   * administratora: przy starcie hasło wraca do `VTT_ADMIN_PASSWORD` (znów
   * tymczasowe). Po użyciu zdejmij z `.env`, inaczej każdy restart je cofnie.
   */
  adminPasswordReset?: boolean;
  /**
   * Sloty sesji (etap 44c). **Opcjonalne, i brak sekcji ma znaczenie**: tak
   * stoją testy dymne (~80 literałów konfiguracji), w których kampania gra od
   * chwili założenia — `POST /api/campaigns` od razu rozpoczyna jej sesję
   * (i kończy pozostałe sesje tego MG, jak dawne „nowa kampania przejmuje
   * stół”), bez limitu i bez zegara bezczynności. `loadConfig` daje sekcję
   * zawsze, więc dev, E2E i produkcja mają przygotowanie, limit i zegar.
   */
  sessions?: SessionConfig;
}

export interface SessionConfig {
  /** Ile sesji naraz (`VTT_MAX_SESSIONS`, domyślnie 2 — decyzja MG z 26.09). */
  maxSessions: number;
  /** Zwolnienie slotu, gdy przy stole nie ma żadnego gniazda (`VTT_SESSION_EMPTY_MINUTES`, 15). */
  emptyMinutes: number;
  /** Zwolnienie slotu po tylu minutach bez zdarzenia gry (`VTT_SESSION_IDLE_MINUTES`, 180). */
  idleMinutes: number;
}

/** Dodatnia liczba z env albo wartość domyślna — `0` i śmieci nie wyłączają limitu. */
function positive(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export interface BackupConfig {
  /**
   * Gdzie lądują snapshoty. Poza repozytorium, bo kopia niesie dokładnie to
   * samo, co `data/private/` — treść kampanii i dane z podręcznika.
   */
  dir: string;
  /** Co ile minut powstaje kopia; `0` wyłącza timer razem z kopią startową. */
  intervalMinutes: number;
  /** Rotacja: ile najświeższych kopii zostaje bez pytania o dobę. */
  keepHourly: number;
  /** Rotacja: ile dób wstecz zostaje po jednej kopii. */
  keepDaily: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    audioPython: env.AUDIO_PYTHON || undefined,
    port: Number(env.PORT ?? 3001),
    host: env.HOST ?? '127.0.0.1',
    clientOrigin: env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    databaseUrl: env.DATABASE_URL ?? 'file:./dev.db',
    gmName: env.GM_NAME ?? 'MG',
    gmPassword: env.GM_PASSWORD,
    cookieSecret: env.COOKIE_SECRET ?? 'dev-secret-change-me',
    // Rok (decyzja MG z 01.10) — gracz nie ma hasła i wraca linkiem zaproszenia.
    sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 365),
    // Defaults assume cwd = packages/server (dev scripts) → repo-root dirs.
    uploadsDir: resolve(env.UPLOADS_DIR ?? '../../uploads'),
    dataPublicDir: resolve(env.DATA_PUBLIC_DIR ?? '../../data/public'),
    dataPrivateDir: resolve(env.DATA_PRIVATE_DIR ?? '../../data/private'),
    aiGatewayUrl: (env.AI_GATEWAY_URL ?? 'http://127.0.0.1:8100').replace(/\/$/, ''),
    aiGatewayApiKey: env.AI_GATEWAY_API_KEY ?? '',
    aiHealthIntervalMs: Number(env.AI_HEALTH_INTERVAL_MS ?? 10_000),
    aiRequestTimeoutMs: Number(env.AI_REQUEST_TIMEOUT_MS ?? 120_000),
    aiOwnerGraceMs: positive(env.VTT_AI_OWNER_GRACE_SECONDS, 120) * 1000,
    // Domyślnie w `data/private` (gitignore) — dziennik decyzji cytuje prompt,
    // a w prompcie stoją sekrety NPC-ów. Pusta wartość wyłącza zapis.
    botDecisionLogPath:
      env.BOT_DECISION_LOG === ''
        ? ''
        : resolve(env.BOT_DECISION_LOG ?? '../../data/private/bot-decisions.jsonl'),
    rateLimits: env.RATE_LIMITS !== '0',
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    registrationOpen: (env.VTT_REGISTRATION ?? 'open').trim().toLowerCase() !== 'closed',
    ...(env.VTT_ADMIN_LOGIN?.trim() ? { adminLogin: env.VTT_ADMIN_LOGIN.trim() } : {}),
    ...(env.VTT_ADMIN_PASSWORD ? { adminPassword: env.VTT_ADMIN_PASSWORD } : {}),
    adminPasswordReset: env.VTT_ADMIN_RESET_PASSWORD === '1',
    sessions: {
      maxSessions: Math.floor(positive(env.VTT_MAX_SESSIONS, 2)),
      emptyMinutes: positive(env.VTT_SESSION_EMPTY_MINUTES, 15),
      idleMinutes: positive(env.VTT_SESSION_IDLE_MINUTES, 180),
    },
    backups: {
      dir: resolve(env.BACKUP_DIR ?? '../../data/private/backups'),
      intervalMinutes: Number(env.BACKUP_INTERVAL_MINUTES ?? 60),
      keepHourly: Number(env.BACKUP_KEEP_HOURLY ?? SNAPSHOT_RULES_DEFAULT.keepHourly),
      keepDaily: Number(env.BACKUP_KEEP_DAILY ?? SNAPSHOT_RULES_DEFAULT.keepDaily),
    },
  };
}
