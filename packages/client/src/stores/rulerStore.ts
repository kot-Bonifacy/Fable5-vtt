import { create } from 'zustand';
import type { ScenePoint } from '@vtt/shared';
import { RULER_IDLE_TIMEOUT_MS } from '@vtt/shared';

/**
 * Rulers on the map (stage 16) — core VTT, no game system.
 *
 * Which tool is armed lives in `mapToolStore` (stage 17) — this store only
 * carries the lines themselves.
 *
 * The local line is whatever this user is dragging right now; remote lines are
 * what the other viewers of the scene are measuring. Both are throw-away: a
 * remote line that stops updating disappears on its own, because a client that
 * navigated away never sends its `ruler:clear`.
 */

export interface RemoteRuler {
  userId: string;
  userName: string;
  points: ScenePoint[];
  /** When the last update arrived — drives the idle sweep. */
  at: number;
}

interface RulerStoreState {
  /** The line this user is dragging; null when nothing is being measured. */
  local: ScenePoint[] | null;
  /** GM only: measure without showing the line to the players. */
  privateMode: boolean;
  remote: Record<string, RemoteRuler>;

  setLocal: (points: ScenePoint[] | null) => void;
  setPrivateMode: (privateMode: boolean) => void;
  receive: (ruler: Omit<RemoteRuler, 'at'>) => void;
  drop: (userId: string) => void;
  /** Forgets lines nobody has refreshed — called from the map's ticker. */
  sweep: (now?: number) => void;
  clearAll: () => void;
}

export const useRulerStore = create<RulerStoreState>((set, get) => ({
  local: null,
  privateMode: false,
  remote: {},

  setLocal: (local) => set({ local }),
  setPrivateMode: (privateMode) => set({ privateMode }),
  receive: ({ userId, userName, points }) =>
    set((state) => ({
      remote: { ...state.remote, [userId]: { userId, userName, points, at: Date.now() } },
    })),
  drop: (userId) =>
    set((state) => {
      if (!(userId in state.remote)) return state;
      const remote = { ...state.remote };
      delete remote[userId];
      return { remote };
    }),
  sweep: (now = Date.now()) => {
    const { remote } = get();
    const kept = Object.fromEntries(
      Object.entries(remote).filter(([, ruler]) => now - ruler.at < RULER_IDLE_TIMEOUT_MS),
    );
    if (Object.keys(kept).length !== Object.keys(remote).length) set({ remote: kept });
  },
  clearAll: () => set({ local: null, remote: {} }),
}));
