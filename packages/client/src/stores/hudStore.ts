import { create } from 'zustand';
import type { CpredAttackMode } from '@vtt/shared';

/**
 * What the combat HUD has in hand (stage 16f) — core-side UI memory, like
 * `selectionStore` and for the same reasons: nobody else at the table needs to
 * know which weapon I have highlighted, and it never travels.
 *
 * The active weapon is the whole reason a click on an enemy means anything. It
 * is stamped with the token it belongs to, because a stale slot from the
 * previous figure firing *this* figure's gun is exactly the class of bug that
 * survives a demo.
 */

/** The slot the action bar has in hand — everything a click on a target needs. */
export interface HudActiveWeapon {
  /** Token that will do the shooting; a slot from any other one is stale. */
  tokenId: string;
  /** Slot id, so the bar can highlight the button this came from. */
  slotId: string;
  weaponRowId: string;
  mode: CpredAttackMode;
  name: string;
  /** True for a melee weapon — the planner refuses it past two metres. */
  melee: boolean;
  /**
   * True when this weapon is aimed at a square of ground rather than at a
   * figure (stage 16d): the blast is centred on a square, so the click that
   * fires it lands on the map, not on somebody.
   */
  pointTarget: boolean;
  /**
   * Reach of the cone this weapon sprays (stage 16g), when its load spreads.
   * Unlike `pointTarget` it changes nothing about the click — it only tells the
   * map to show what the shot will also sweep.
   */
  coneRangeM?: number;
}

/** A slot whose action needs words or a target before it can be booked. */
export type HudFormKind = 'hold' | 'grapple' | 'stabilize';

interface HudStoreState {
  activeWeapon: HudActiveWeapon | null;
  /** Form the bar has asked for, opened above it; null when none is. */
  form: HudFormKind | null;
  /** Is the left rail folded away? Remembered like the side panel's width. */
  collapsed: boolean;

  setActiveWeapon: (weapon: HudActiveWeapon | null) => void;
  setForm: (form: HudFormKind | null) => void;
  setCollapsed: (collapsed: boolean) => void;
}

const COLLAPSED_KEY = 'vtt.hudCollapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    // Private mode only costs the remembered state.
    return false;
  }
}

export const useHudStore = create<HudStoreState>((set) => ({
  activeWeapon: null,
  form: null,
  collapsed: readCollapsed(),

  setActiveWeapon: (activeWeapon) => set({ activeWeapon }),
  setForm: (form) => set({ form }),
  setCollapsed: (collapsed) => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // See above.
    }
    set({ collapsed });
  },
}));

/**
 * The active weapon, but only when it still belongs to the steered token.
 *
 * Not a selector: it takes the token id so the caller decides what „steered"
 * means (the map asks about its own selection, the bar about the token it is
 * drawing).
 */
export function activeWeaponOf(
  weapon: HudActiveWeapon | null,
  tokenId: string | null,
): HudActiveWeapon | null {
  if (!weapon || !tokenId || weapon.tokenId !== tokenId) return null;
  return weapon;
}
