import type { DiceSkinId } from './dice.js';

/** User roles. Exactly two by design — see the project survey. */
export type Role = 'GM' | 'PLAYER';

export const ROLE_GM: Role = 'GM';
export const ROLE_PLAYER: Role = 'PLAYER';

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
}

/** Response of /api/auth/me, /api/auth/login and POST /api/join/:token. */
export interface AuthState {
  user: SessionUser;
  activeCampaign: CampaignSummary | null;
}

/** Response of GET /api/join/:token — what a player sees before joining. */
export interface JoinInfo {
  campaignName: string;
  /** Names of players already in the campaign, offered for re-entry. */
  players: string[];
}

export interface InvitationSummary {
  id: string;
  token: string;
  expiresAt: string;
  revoked: boolean;
  createdAt: string;
}

export interface PlayerSummary {
  id: string;
  name: string;
  joinedAt: string;
}

export interface CampaignDetail extends CampaignSummary {
  active: boolean;
  createdAt: string;
  players: PlayerSummary[];
  invitations: InvitationSummary[];
}

/** Standard acknowledgement payload for Socket.IO events. */
export type SocketAck<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
