import { create } from 'zustand';
import type { StateSyncPayload, StatusDefinition, TokenView } from '@vtt/shared';

/** What the local user is allowed to see — governs HP stripping on merges. */
export interface TokenViewerCtx {
  myUserId: string | null;
  isGm: boolean;
}

/**
 * Defense-in-depth mirror of the server rule: a player keeps HP only for
 * tokens they own. The server never sends foreign HP, but a token that
 * changes owner mid-session could otherwise leave a stale value behind.
 */
function normalizeHp(token: TokenView, viewer: TokenViewerCtx): TokenView {
  if (!viewer.isGm && token.ownerId !== viewer.myUserId && 'hp' in token) {
    const { hp: _hp, ...rest } = token;
    return rest;
  }
  return token;
}

interface TokenStoreState {
  /** Tokens of the currently viewed scene, keyed by id (insertion-ordered). */
  tokens: Record<string, TokenView>;
  /** Status registry fetched from `/public/cpred/statuses.json`. */
  statuses: StatusDefinition[];

  applySync: (payload: StateSyncPayload, viewer: TokenViewerCtx) => void;
  /** Replaces the whole list — used by `token:sync` after a fog repaint. */
  applyTokens: (tokens: TokenView[], viewer: TokenViewerCtx) => void;
  /** Merges an upsert; absent keys (e.g. `hp` in public payloads) keep old values. */
  upsert: (token: TokenView, viewer: TokenViewerCtx) => void;
  remove: (tokenId: string) => void;
  /** `facing` is sent only on the drop (stage 27j); undefined leaves it alone. */
  applyMove: (tokenId: string, x: number, y: number, facing?: number | null) => void;
  setStatuses: (statuses: StatusDefinition[]) => void;
}

export const useTokenStore = create<TokenStoreState>((set) => ({
  tokens: {},
  statuses: [],

  applySync: (payload, viewer) =>
    set(() => {
      const tokens: Record<string, TokenView> = {};
      for (const token of payload.tokens) tokens[token.id] = normalizeHp(token, viewer);
      return { tokens };
    }),

  applyTokens: (incoming, viewer) =>
    set(() => {
      const tokens: Record<string, TokenView> = {};
      for (const token of incoming) tokens[token.id] = normalizeHp(token, viewer);
      return { tokens };
    }),

  upsert: (token, viewer) =>
    set((state) => {
      const existing = state.tokens[token.id];
      const merged = normalizeHp(existing ? { ...existing, ...token } : token, viewer);
      return { tokens: { ...state.tokens, [token.id]: merged } };
    }),

  remove: (tokenId) =>
    set((state) => {
      if (!(tokenId in state.tokens)) return state;
      const tokens = { ...state.tokens };
      delete tokens[tokenId];
      return { tokens };
    }),

  applyMove: (tokenId, x, y, facing) =>
    set((state) => {
      const token = state.tokens[tokenId];
      if (!token) return state;
      const moved = { ...token, x, y, ...(facing === undefined ? {} : { facing }) };
      return { tokens: { ...state.tokens, [tokenId]: moved } };
    }),

  setStatuses: (statuses) => set({ statuses }),
}));

let statusesRequested = false;

/** Fetches the status registry once per session (static, committed data). */
export function ensureStatusesLoaded(): void {
  if (statusesRequested) return;
  statusesRequested = true;
  fetch('/public/cpred/statuses.json')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((data: { statuses?: StatusDefinition[] }) => {
      if (Array.isArray(data.statuses)) useTokenStore.getState().setStatuses(data.statuses);
    })
    .catch(() => {
      // Missing registry only disables status icons — not worth surfacing.
      statusesRequested = false;
    });
}
