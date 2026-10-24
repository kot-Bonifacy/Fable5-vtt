import type { AiAccessStatus } from './ai-access.js';
import type { DiceSkinId } from './dice.js';
import type { PlayerColor } from './player-colors.js';

/**
 * User roles. Two at the table by design (see the project survey); the third,
 * `ADMIN` (stage 53), never sits at one — it runs the server: GM accounts,
 * sessions, AI and whole-database backups.
 */
export type Role = 'GM' | 'PLAYER' | 'ADMIN';

export const ROLE_GM: Role = 'GM';
export const ROLE_PLAYER: Role = 'PLAYER';
export const ROLE_ADMIN: Role = 'ADMIN';

/** Public view of an authenticated user (safe to send to any client). */
export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  /**
   * Cosmetic dice skin this user rolls with (stage 27d). It sits on the
   * identity rather than in the browser because it has to reach OTHER
   * tables: what the room sees tumbling are the roller's dice, so the server
   * stamps it onto every published roll.
   */
  diceSkin: DiceSkinId;
  /**
   * The server's owner (stage 44a): the GM account from `.env`, the admin
   * account (stage 53) and player accounts linked to them. Since stage 53 the
   * flag means „the AI on the owner's PC is theirs”: the owner's campaigns
   * always have AI and an open socket of any such account is the owner's
   * presence. The panel itself belongs to the `ADMIN` role.
   */
  owner: boolean;
  /**
   * The password is temporary (stage 53): set by the admin, or the admin's own
   * first password from `.env`. Until it is changed the server answers nothing
   * but `/api/auth/me`, `/api/auth/password` and logout, and refuses sockets.
   */
  mustChangePassword?: boolean;
  /**
   * GM accounts only: the login, which the top bar shows as the GM's nick —
   * every GM sits at the table as „MG", so `name` says nothing there.
   * Optional because bot actors are built without it.
   */
  login?: string | null;
}

export interface CampaignSummary {
  id: string;
  name: string;
  /**
   * Poligon czy stół, przy którym ktoś naprawdę gra (postulat MG z 22.08)?
   *
   * Jedzie razem z nazwą, a nie osobną trasą, bo odpowiedź jest potrzebna
   * wszędzie tam, gdzie widać nazwę — w nagłówku i przed czynnościami, których
   * nie da się cofnąć. Nie jest uprawnieniem: niczego nie blokuje, tylko mówi,
   * gdzie się stoi.
   */
  sandbox: boolean;
  /**
   * Trwająca sesja (etap 44c): od kiedy (ISO), albo null — u MG przygotowanie,
   * u gracza widok „Między sesjami” bez stołu.
   */
  sessionStartedAt: string | null;
  /** Kiedy skończyła się ostatnia sesja (ISO), null — jeszcze żadnej nie było. */
  lastSessionEndedAt: string | null;
}

/** Response of /api/auth/me, /api/auth/login and POST /api/join/:token. */
export interface AuthState {
  user: SessionUser;
  activeCampaign: CampaignSummary | null;
}

/** Response of GET /api/join/:token — what a player sees before joining. */
/**
 * What the join screen shows before entering (stage 44b): the link is a named
 * key, so the player sees whose seat it opens instead of picking a name.
 */
export interface JoinInfo {
  campaignName: string;
  /** The player's name — written on the link by the GM. */
  playerName: string;
  /** A renewal link: back into an existing account on a new device. */
  renewal: boolean;
}

/**
 * Where a named link stands (stage 44b). Since 24.10 a used link keeps working —
 * it is the player's permanent key — so only `expired` and `revoked` refuse entry.
 */
export type InvitationState = 'waiting' | 'used' | 'expired' | 'revoked';

export interface InvitationSummary {
  id: string;
  token: string;
  /** Null: no deadline (the default since 24.10). */
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
  /** Player name on the link; null only on pre-44b anonymous links (all revoked). */
  name: string | null;
  /** Renewal link for an existing player (stage 44b). */
  renewal: boolean;
  usedAt: string | null;
  state: InvitationState;
  /** Etap 57a: karta, którą link przypisze graczowi przy wejściu („ta karta jest twoja”). */
  characterId?: string | null;
}

/** Longest deadline a caller may put on an unused named link; by default it has none (24.10). */
export const INVITATION_TTL_HOURS = 7 * 24;

/** Longest player name the GM can write on a link. */
export const PLAYER_NAME_MAX_LENGTH = 32;

export interface PlayerSummary {
  id: string;
  name: string;
  joinedAt: string;
  /** Kolor wybrany przez MG (etap 60c); `null` — z palety po kolejności dołączenia. */
  color: PlayerColor | null;
}

export interface CampaignDetail extends CampaignSummary {
  /** Otwarta u tego MG (etap 44c) — przy niej pracuje, gdy wraca do stołu. */
  open: boolean;
  createdAt: string;
  players: PlayerSummary[];
  invitations: InvitationSummary[];
  /** Etap 57a: karty z pliku, które czekają na gracza — do wyboru przy „Nowy gracz”. */
  pendingCards?: PendingCardSummary[];
}

/** „Usuń kampanię” MG (etap 57b): ile kont graczy odeszło razem z nią. */
export interface CampaignDeleteResult {
  players: number;
}

/** Karta „czeka na gracza” (57a): imię postaci i imię gracza z pliku. */
export interface PendingCardSummary {
  id: string;
  name: string;
  pendingOwner: string;
}

/** Standard acknowledgement payload for Socket.IO events. */
export type SocketAck<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Why the server closed this socket's session (#11, 01.10): logged out (in this
 * or another tab) or past `SESSION_TTL_DAYS`; since stage 44a also a password
 * changed elsewhere and an account blocked by the owner. Sent as `auth:ended`
 * right before the server disconnects the socket.
 */
export type AuthEndedReason = 'logout' | 'expired' | 'password' | 'blocked' | 'deleted';

export interface AuthEndedPush {
  reason: AuthEndedReason;
}

/*
 * Konta MG (etap 44a). Reguły loginu i hasła mieszkają tu, bo sprawdzają je
 * obie strony: formularz zanim cokolwiek wyśle, serwer zanim zapisze.
 */

export const GM_LOGIN_MIN_LENGTH = 3;
export const GM_LOGIN_MAX_LENGTH = 32;
export const GM_PASSWORD_MIN_LENGTH = 10;
/** Górna granica tylko po to, żeby nikt nie kazał serwerowi haszować megabajta. */
export const GM_PASSWORD_MAX_LENGTH = 256;
const GM_LOGIN_PATTERN = /^[a-z0-9._-]+$/;

/** Login tak, jak leży w bazie: bez spacji z brzegów i małymi literami. */
export function normalizeGmLogin(raw: string): string {
  return raw.trim().toLowerCase();
}

export type GmAccountError =
  | 'LOGIN_INVALID'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_SAME_AS_LOGIN'
  | 'PASSWORD_MISMATCH'
  | 'PASSWORD_UNCHANGED';

/** Login 3–32 znaki: litery łacińskie, cyfry, `-`, `_`, `.`. */
export function gmLoginError(login: string): GmAccountError | null {
  const normalized = normalizeGmLogin(login);
  if (normalized.length < GM_LOGIN_MIN_LENGTH || normalized.length > GM_LOGIN_MAX_LENGTH) {
    return 'LOGIN_INVALID';
  }
  return GM_LOGIN_PATTERN.test(normalized) ? null : 'LOGIN_INVALID';
}

/**
 * Nowe hasło: co najmniej 10 znaków, inne niż login, dwa razy to samo.
 * Login jest opcjonalny — link resetu go zna, zmiana hasła też.
 */
export function gmPasswordError(
  password: string,
  repeat: string,
  login: string | null,
): GmAccountError | null {
  if (password.length < GM_PASSWORD_MIN_LENGTH) return 'PASSWORD_TOO_SHORT';
  if (password.length > GM_PASSWORD_MAX_LENGTH) return 'PASSWORD_TOO_LONG';
  if (login !== null && password.trim().toLowerCase() === normalizeGmLogin(login)) {
    return 'PASSWORD_SAME_AS_LOGIN';
  }
  return password === repeat ? null : 'PASSWORD_MISMATCH';
}

/** Zdanie dla kodu odmowy z tras kont; `null`, gdy kod jest obcy. */
export function gmAccountErrorText(code: string): string | null {
  switch (code) {
    case 'LOGIN_INVALID':
      return `Login: ${GM_LOGIN_MIN_LENGTH}–${GM_LOGIN_MAX_LENGTH} znaki — litery bez polskich znaków, cyfry, „-”, „_” lub „.”.`;
    case 'LOGIN_TAKEN':
      return 'Ten login jest już zajęty — wybierz inny.';
    case 'PASSWORD_TOO_SHORT':
      return `Hasło musi mieć co najmniej ${GM_PASSWORD_MIN_LENGTH} znaków.`;
    case 'PASSWORD_TOO_LONG':
      return `Hasło może mieć najwyżej ${GM_PASSWORD_MAX_LENGTH} znaków.`;
    case 'PASSWORD_SAME_AS_LOGIN':
      return 'Hasło nie może być takie samo jak login.';
    case 'PASSWORD_MISMATCH':
      return 'Hasła się różnią — wpisz to samo w obu polach.';
    case 'INVALID_CREDENTIALS':
      return 'Nieprawidłowy login lub hasło.';
    case 'WRONG_PASSWORD':
      return 'Obecne hasło jest nieprawidłowe.';
    case 'ACCOUNT_BLOCKED':
      return 'To konto zostało zablokowane przez administratora serwera.';
    case 'PASSWORD_UNCHANGED':
      return 'Nowe hasło musi być inne niż obecne.';
    case 'PASSWORD_CHANGE_REQUIRED':
      return 'Najpierw ustaw własne hasło — obecne jest tymczasowe.';
    case 'REGISTRATION_CLOSED':
      return 'Rejestracja nowych kont MG jest teraz wyłączona.';
    case 'TOO_MANY_REGISTRATIONS':
      return 'Z tego adresu założono już kilka kont — spróbuj ponownie za godzinę.';
    case 'TOO_MANY_ATTEMPTS':
      return 'Za dużo nieudanych prób z tego adresu — spróbuj ponownie za kilkanaście minut.';
    case 'INVALID_RESET':
      return 'Ten link do ustawienia hasła jest nieważny — wygasł albo już go użyto. Poproś administratora serwera o nowy.';
    case 'PASSWORD_FROM_ENV':
      return 'Hasło konta właściciela ustawia się w pliku .env (GM_PASSWORD).';
    default:
      return null;
  }
}

/** GET /api/auth/config — co ekran logowania ma pokazać, zanim ktokolwiek się zaloguje. */
export interface AuthConfig {
  registration: boolean;
}

/** Wiersz listy kont MG w panelu administratora (etap 44a, od 53 w panelu admina). */
export interface GmAccountView {
  id: string;
  login: string;
  /** Konto MG właściciela z `.env` — bez resetu, blokady, usunięcia i hasła z panelu. */
  owner: boolean;
  blocked: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  campaigns: number;
  /** Zgoda na AI właściciela (44d); konto właściciela ma AI zawsze. */
  ai: AiAccessStatus;
  /** Hasło tymczasowe od administratora czeka na zmianę (etap 53). */
  temporaryPassword: boolean;
  /** Trwa sesja którejś kampanii tego MG. */
  sessionRunning: boolean;
}

/** Jednorazowy link ustawienia hasła — token zna tylko ta odpowiedź. */
export interface PasswordResetLink {
  token: string;
  expiresAt: string;
}

/** GET /api/auth/reset/:token — czyje hasło ustawia link. */
export interface PasswordResetInfo {
  login: string;
}
