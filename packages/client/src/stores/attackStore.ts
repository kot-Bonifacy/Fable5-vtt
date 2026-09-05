import { create } from 'zustand';
import type { CpredAimPoint, CpredAttackMode } from '@vtt/shared';

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
  /**
   * Sheet doing the shooting. Absent when a statist is firing (stage 16b) —
   * then `attackerTokenId` is required and the token's profile is the sheet.
   */
  characterId?: string;
  /** Name on the cursor and on the cup: the sheet's, or the token's. */
  characterName: string;
  /** Token that will do the shooting; the server re-checks the link. */
  attackerTokenId?: string;
  weaponRowId: string;
  weaponName: string;
  mode: CpredAttackMode;
  /**
   * Aimed Shot and what at (s. 170): −8 to hit, one attack, the whole Action.
   * Absent means an ordinary attack. Chosen on the banner over the map *after*
   * the crosshair is armed, because that is where the shooter is looking — and
   * because it is a property of this shot, not of the weapon row.
   */
  aimedAt?: CpredAimPoint;
  /** Situational modifier carried over from the roll dialog. */
  modifier: number;
  /** True for melee weapons — the map only accepts targets within reach. */
  melee: boolean;
  /**
   * Let go of this row instead of using it (stage 16d) — „Rzut przedmiotem".
   *
   * Turns a knife into a ranged attack for one throw: ZW + Atletyka, the
   * Grenade Launcher's range line and 25 m of arm (s. 177). Never set for a
   * grenade, which is thrown by definition.
   */
  thrown?: boolean;
  /**
   * Fire what is bolted onto this row rather than the row itself (stage 31).
   *
   * A property of the crosshair rather than of the weapon: „Atak" on the rifle
   * and „Atak" on its underbarrel launcher arm the same map with two different
   * shots, and the map has to remember which one is being pointed.
   */
  attachmentId?: string;
  /** Name of that attachment, for the crosshair's label. */
  attachmentName?: string;
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
  /** Changes the aim point of the armed crosshair; null goes back to no aim. */
  setAimPoint: (aimedAt: CpredAimPoint | null) => void;
  setOverlay: (overlay: RangeOverlay | null) => void;
  toggleOverlay: (overlay: RangeOverlay) => void;
}

export const useAttackStore = create<AttackStoreState>((set, get) => ({
  targeting: null,
  overlay: null,
  lastMode: 'single',

  arm: (targeting) => set({ targeting, lastMode: targeting.mode }),
  disarm: () => set({ targeting: null }),
  setAimPoint: (aimedAt) => {
    const targeting = get().targeting;
    if (!targeting) return;
    const next = { ...targeting };
    if (aimedAt) next.aimedAt = aimedAt;
    else delete next.aimedAt;
    set({ targeting: next });
  },
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
