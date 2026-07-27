import { create } from 'zustand';
import type { CpredAttackMode } from '@vtt/shared';

/**
 * Targeting mode (stage 16): the bridge between the character sheet and the
 * map. Pressing „Atakuj" on a weapon row arms this store; the map then turns
 * its cursor into a crosshair and the next click on a token loads the dice cup
 * with that attack. Escape disarms it.
 *
 * Nothing here decides anything about the attack — the distance and the DV are
 * the server's business. This is the UI's memory of „what am I pointing with".
 */

export interface AttackTargeting {
  characterId: string;
  characterName: string;
  /** Token that will do the shooting; the server re-checks the link. */
  attackerTokenId?: string;
  weaponRowId: string;
  weaponName: string;
  mode: CpredAttackMode;
  /** Aimed shot at the head (−8), single shots only. */
  aimed: boolean;
  /** Situational modifier carried over from the roll dialog. */
  modifier: number;
  /** True for melee weapons — the map only accepts targets within reach. */
  melee: boolean;
}

/** Which token's range bands are drawn as rings on the map. */
export interface RangeOverlay {
  tokenId: string;
  weaponName: string;
  /** DV per band, straight from the weapon type (nulls = out of reach). */
  rangeDv: (number | null)[];
  /** True when the rings show the autofire table instead. */
  autofire: boolean;
}

interface AttackStoreState {
  targeting: AttackTargeting | null;
  overlay: RangeOverlay | null;
  /** Last mode chosen on the sheet, so the next attack starts where you left. */
  lastMode: CpredAttackMode;

  arm: (targeting: AttackTargeting) => void;
  disarm: () => void;
  setOverlay: (overlay: RangeOverlay | null) => void;
  toggleOverlay: (overlay: RangeOverlay) => void;
}

export const useAttackStore = create<AttackStoreState>((set, get) => ({
  targeting: null,
  overlay: null,
  lastMode: 'single',

  arm: (targeting) => set({ targeting, lastMode: targeting.mode }),
  disarm: () => set({ targeting: null }),
  setOverlay: (overlay) => set({ overlay }),
  toggleOverlay: (overlay) => {
    const current = get().overlay;
    const same =
      current?.tokenId === overlay.tokenId &&
      current?.weaponName === overlay.weaponName &&
      current?.autofire === overlay.autofire;
    set({ overlay: same ? null : overlay });
  },
}));
