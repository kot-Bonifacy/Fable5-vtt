import type { SessionEndReason } from './sessions.js';

/**
 * Panel administratora (etap 53): konto `ADMIN` nie siada przy stole, tylko
 * prowadzi serwer — konta MG, sesje i ich dziennik, AI właściciela,
 * rejestrację i kopie całej bazy. Tu są kształty tras `/api/admin/…`.
 */

/** Trwająca sesja w panelu — zajmuje jeden z `VTT_MAX_SESSIONS` slotów. */
export interface AdminRunningSession {
  campaignId: string;
  campaignName: string;
  gmLogin: string;
  startedAt: string;
  /** Gracze, których gniazda siedzą teraz przy stole (bez powtórzeń). */
  atTable: string[];
  /** Ta sesja trzyma teraz AI właściciela (44d). */
  aiHolder: boolean;
}

/** Wiersz dziennika sesji — zapisywany od etapu 53, starszych sesji nie ma. */
export interface AdminSessionRecord {
  id: string;
  /** null — kampanię usunięto, został sam wpis. */
  campaignId: string | null;
  campaignName: string;
  gmLogin: string;
  startedAt: string;
  /** null — sesja trwa. */
  endedAt: string | null;
  endReason: SessionEndReason | null;
  /** Gracze, którzy choć raz usiedli przy stole w tej sesji. */
  players: string[];
}

/** `GET /api/admin/sessions`. */
export interface AdminSessionsView {
  running: AdminRunningSession[];
  history: AdminSessionRecord[];
  maxSessions: number;
}

/** Ile wpisów dziennika oddaje panel — skala to kilka sesji tygodniowo. */
export const ADMIN_SESSION_HISTORY_LIMIT = 200;

/** `GET`/`POST /api/admin/settings`. */
export interface AdminSettingsView {
  /** Rejestracja nowych kont MG otwarta. */
  registration: boolean;
}

/** Ciało `POST /api/admin/accounts/:id/password` — hasło tymczasowe dla MG. */
export interface AdminTemporaryPasswordBody {
  password: string;
}

/** Ciało `DELETE /api/admin/accounts/:id` — login przepisany ręką jako potwierdzenie. */
export interface AdminDeleteAccountBody {
  confirm: string;
}

/** Co zostało usunięte razem z kontem MG. */
export interface AdminDeleteAccountResult {
  campaigns: number;
  players: number;
}

/** Krótki opis powodu końca sesji w dzienniku. */
export function sessionEndReasonLabel(reason: SessionEndReason | null): string {
  switch (reason) {
    case 'gm':
      return 'zakończył MG';
    case 'empty':
      return 'nikogo przy stole';
    case 'idle':
      return 'bezczynność';
    case 'admin':
      return 'zakończył administrator';
    case 'deleted':
      return 'usunięto konto MG';
    default:
      return 'trwa';
  }
}

/** Polskie zdanie odmowy tras panelu administratora; null — kod spoza obszaru. */
export function adminErrorText(code: string): string | null {
  switch (code) {
    case 'OWNER_ACCOUNT':
      return 'Konta MG właściciela nie zmienia się z panelu — hasło bierze się z .env (GM_PASSWORD).';
    case 'CONFIRM_MISMATCH':
      return 'Login w potwierdzeniu nie zgadza się z kontem — wpisz go dokładnie.';
    case 'NOT_FOUND':
      return 'Tego już nie ma — odśwież panel.';
    case 'SESSION_NOT_RUNNING':
      return 'Ta sesja już się skończyła.';
    case 'BACKUP_DISABLED':
      return 'Kopie są wyłączone w konfiguracji serwera (BACKUP_DIR).';
    default:
      return null;
  }
}
