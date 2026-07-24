import { create } from 'zustand';
import type { CpredCharacterData, CpredRegistry, CpredRollRequest } from '@vtt/shared';
import { planCpredCheck } from '@vtt/shared';

/**
 * Sheet-driven rolls (stage 08). Clicking a skill or a stat opens the roll
 * dialog; confirming it loads the dice cup — the throw itself happens when
 * the player shakes and releases the cup, so every real roll keeps its
 * physical gesture (and its entropy).
 */

/** What the dialog is being opened for. */
export interface RollTarget {
  characterId: string;
  characterName: string;
  kind: CpredRollRequest['kind'];
  skillId?: string;
  statId?: CpredRollRequest['statId'];
}

/** A check waiting in the cup: everything the server needs, plus the label. */
export interface PendingRoll extends RollTarget {
  request: CpredRollRequest;
  visibility: 'public' | 'gm';
  /** Chat-card title, e.g. `Percepcja (INT)`. */
  title: string;
  /** Total modifier — shown on the cup so the thrower knows what they carry. */
  modifierTotal: number;
}

interface RollStoreState {
  /** Open roll dialog (null = closed). */
  target: RollTarget | null;
  /** Check loaded into the cup, waiting for the throw. */
  pending: PendingRoll | null;
  /** Last dialog choices, reused for the next roll (and by Shift+click). */
  lastModifier: number;
  lastVisibility: 'public' | 'gm';

  openDialog: (target: RollTarget) => void;
  closeDialog: () => void;
  loadCup: (pending: PendingRoll) => void;
  clearCup: () => void;
  remember: (modifier: number, visibility: 'public' | 'gm') => void;
}

export const useRollStore = create<RollStoreState>((set) => ({
  target: null,
  pending: null,
  lastModifier: 0,
  lastVisibility: 'public',

  openDialog: (target) => set({ target }),
  closeDialog: () => set({ target: null }),
  loadCup: (pending) => set({ pending, target: null }),
  clearCup: () => set({ pending: null }),
  remember: (lastModifier, lastVisibility) => set({ lastModifier, lastVisibility }),
}));

/**
 * Shift+click path: skips the dialog and loads the cup straight away with the
 * last used modifier and visibility (no Luck — spending it is always a
 * deliberate choice).
 */
export function quickLoadCup(
  target: RollTarget,
  data: CpredCharacterData,
  registry: CpredRegistry,
): void {
  const store = useRollStore.getState();
  const request: CpredRollRequest = {
    kind: target.kind,
    ...(target.skillId ? { skillId: target.skillId } : {}),
    ...(target.statId ? { statId: target.statId } : {}),
    modifier: store.lastModifier,
    luckSpent: 0,
  };
  const planned = planCpredCheck(data, registry, request);
  if (!planned.ok) return;
  store.loadCup({
    ...target,
    request,
    visibility: store.lastVisibility,
    title: planned.plan.title,
    modifierTotal: planned.plan.modifierTotal,
  });
}
