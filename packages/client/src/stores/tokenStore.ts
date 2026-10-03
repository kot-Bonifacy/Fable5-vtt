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
  /**
   * Replaces the whole list — used by `token:sync` after a fog repaint. A token
   * in the middle of a walk (`noteMoveFrame`) keeps its `x`/`y`: the list is
   * built from the database, which holds the starting square until the drop
   * (#47 on a Dynamic scene). Who is on the list still comes from the list.
   */
  applyTokens: (tokens: TokenView[], viewer: TokenViewerCtx) => void;
  /**
   * Merges an upsert; absent keys (e.g. `hp` in public payloads) keep old values.
   * A token already on the map keeps its `x`/`y` unless `moved` (#47): the
   * position belongs to `token:move`, and a sheet save mid-walk carries the
   * stored starting square.
   */
  upsert: (token: TokenView, viewer: TokenViewerCtx, moved?: boolean) => void;
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
    set((state) => {
      const tokens: Record<string, TokenView> = {};
      for (const token of incoming) {
        const existing = state.tokens[token.id];
        const kept = existing && holdsPosition(token.id) ? { x: existing.x, y: existing.y } : {};
        tokens[token.id] = normalizeHp({ ...token, ...kept }, viewer);
      }
      return { tokens };
    }),

  upsert: (token, viewer, moved = false) =>
    set((state) => {
      const existing = state.tokens[token.id];
      const merged = normalizeHp(
        existing
          ? { ...existing, ...token, ...(moved ? {} : { x: existing.x, y: existing.y }) }
          : token,
        viewer,
      );
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

/**
 * How long after its last drag frame a token still counts as walking. Frames
 * come at `TOKEN_MOVE_RATE_HZ`; a hand that stopped (or a mover who dropped off
 * the network before the drop) must not freeze the position for good.
 */
export const WALK_FRAME_HOLD_MS = 3000;

/**
 * How long after the drop a `token:sync` list still may not move the figure
 * (reszta #47, 03.10). The server builds the list for a scene with hiding
 * walls or dynamic vision *before* the final move is written and sends it a
 * few `await`s later — after the drop broadcast. Applied as it stands, that
 * list put the figure back on its starting square until the next move or F5.
 * A list never moves a figure the client already has on purpose (position
 * belongs to `token:move` and to an upsert with `moved`), so holding the
 * landed square for a moment costs nothing.
 */
export const WALK_LANDED_HOLD_MS = 2000;

/** Last intermediate `token:move` per token; the drop removes the entry. */
const walkFrames = new Map<string, number>();
/** When each figure last landed — the drop of its walk. */
const landedAt = new Map<string, number>();

/** Every `token:move` the client applies goes through here first (#47). */
export function noteMoveFrame(tokenId: string, final: boolean, now = Date.now()): void {
  if (final) {
    walkFrames.delete(tokenId);
    landedAt.set(tokenId, now);
  } else walkFrames.set(tokenId, now);
}

/** Does the client's own position outrank the one in a token list? */
export function holdsPosition(tokenId: string, now = Date.now()): boolean {
  const last = walkFrames.get(tokenId);
  if (last !== undefined && now - last < WALK_FRAME_HOLD_MS) return true;
  const landed = landedAt.get(tokenId);
  return landed !== undefined && now - landed < WALK_LANDED_HOLD_MS;
}

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
