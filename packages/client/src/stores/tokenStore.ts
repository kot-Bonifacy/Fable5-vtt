import { create } from 'zustand';
import type { StateSyncPayload, StatusDefinition, TokenView } from '@vtt/shared';

/** What the local user is allowed to see — governs HP stripping on merges. */
export interface TokenViewerCtx {
  myUserId: string | null;
  isGm: boolean;
}

/** Pending "place a token" action started from the GM token panel. */
export interface TokenPlacement {
  name: string;
  imageUrl: string | null;
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
  placement: TokenPlacement | null;

  applySync: (payload: StateSyncPayload, viewer: TokenViewerCtx) => void;
  /** Merges an upsert; absent keys (e.g. `hp` in public payloads) keep old values. */
  upsert: (token: TokenView, viewer: TokenViewerCtx) => void;
  remove: (tokenId: string) => void;
  applyMove: (tokenId: string, x: number, y: number) => void;
  setStatuses: (statuses: StatusDefinition[]) => void;
  setPlacement: (placement: TokenPlacement | null) => void;
}

export const useTokenStore = create<TokenStoreState>((set) => ({
  tokens: {},
  statuses: [],
  placement: null,

  applySync: (payload, viewer) =>
    set(() => {
      const tokens: Record<string, TokenView> = {};
      for (const token of payload.tokens) tokens[token.id] = normalizeHp(token, viewer);
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

  applyMove: (tokenId, x, y) =>
    set((state) => {
      const token = state.tokens[tokenId];
      if (!token) return state;
      return { tokens: { ...state.tokens, [tokenId]: { ...token, x, y } } };
    }),

  setStatuses: (statuses) => set({ statuses }),
  setPlacement: (placement) => set({ placement }),
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
