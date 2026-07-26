import { create } from 'zustand';
import type { CombatView, CombatantView, StateSyncPayload } from '@vtt/shared';

/**
 * Initiative tracker state (stage 14). The server is authoritative: every
 * payload is the complete combat of the viewed scene, already filtered for
 * this viewer, so the store never merges — it replaces.
 */
interface CombatStoreState {
  combat: CombatView | null;
  /** Tokens ticked in the GM's „rozpocznij walkę" picker. */
  selection: string[];

  applySync: (payload: StateSyncPayload) => void;
  setCombat: (combat: CombatView | null) => void;
  setSelection: (tokenIds: string[]) => void;
  toggleSelection: (tokenId: string) => void;
}

export const useCombatStore = create<CombatStoreState>((set) => ({
  combat: null,
  selection: [],

  applySync: (payload) => set({ combat: payload.combat }),
  setCombat: (combat) => set({ combat }),
  setSelection: (selection) => set({ selection }),
  toggleSelection: (tokenId) =>
    set((state) => ({
      selection: state.selection.includes(tokenId)
        ? state.selection.filter((id) => id !== tokenId)
        : [...state.selection, tokenId],
    })),
}));

/*
 * Helpers below are NOT selectors: they build fresh values and would loop a
 * component if passed to `useCombatStore(...)` (the trap from stages 10 and
 * 13). Read the raw slices from the store and call these inside `useMemo`.
 */

/** The participant whose turn it is, or null (also when hidden from us). */
export function activeCombatantOf(combat: CombatView | null): CombatantView | null {
  if (!combat?.activeCombatantId) return null;
  return combat.combatants.find((c) => c.id === combat.activeCombatantId) ?? null;
}

/** The token that is currently acting — used to highlight it on the map. */
export function activeTokenIdOf(combat: CombatView | null): string | null {
  return activeCombatantOf(combat)?.tokenId ?? null;
}

/** This user's participant, if they are the one acting right now. */
export function myActiveCombatant(
  combat: CombatView | null,
  myUserId: string | null,
): CombatantView | null {
  const active = activeCombatantOf(combat);
  if (!active || myUserId === null) return null;
  return active.ownerId === myUserId ? active : null;
}
