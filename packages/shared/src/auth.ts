/** User roles. Exactly two by design — see the project survey. */
export type Role = 'GM' | 'PLAYER';

export const ROLE_GM: Role = 'GM';
export const ROLE_PLAYER: Role = 'PLAYER';

/** Public view of an authenticated user (safe to send to any client). */
export interface SessionUser {
  id: string;
  name: string;
  role: Role;
}

export interface CampaignSummary {
  id: string;
  name: string;
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
export interface SocketAck {
  ok: boolean;
  error?: string;
}
