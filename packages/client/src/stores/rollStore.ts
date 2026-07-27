import { create } from 'zustand';
import type {
  CpredAttackRequest,
  CpredCharacterData,
  CpredHitLocation,
  CpredRegistry,
  CpredRollRequest,
} from '@vtt/shared';
import { planCpredRoll } from '@vtt/shared';

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
  /** Weapon row for `kind: 'damage'`. */
  weaponRowId?: string;
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

/**
 * An initiative roll loaded into the cup (stage 14). It carries no sheet
 * request: the server derives the modifier from the participant's sheet, the
 * player only supplies the throw.
 */
export interface PendingInitiative {
  combatantId: string;
  /** Participant's name, shown on the cup. */
  name: string;
  /** REF, or 0 for a statist without a sheet. */
  modifierTotal: number;
}

/**
 * An attack loaded into the cup (stage 16). The distance and the DV are not
 * here on purpose: the client shows an estimate on the cup, but the server
 * measures the map when the dice actually fly.
 */
export interface PendingAttack {
  characterId: string;
  characterName: string;
  attackerTokenId?: string;
  targetTokenId: string;
  targetName: string;
  request: CpredAttackRequest;
  /** Cup label, e.g. „Zgrzyt 9 → Ganger · 24 m". */
  title: string;
  modifierTotal: number;
}

/** A defender's Evasion roll contesting an attack already on the chat. */
export interface PendingEvasion {
  /** Chat message id of the attack being contested. */
  messageId: number;
  characterId: string;
  characterName: string;
  title: string;
  modifierTotal: number;
}

interface RollStoreState {
  /** Open roll dialog (null = closed). */
  target: RollTarget | null;
  /** Check loaded into the cup, waiting for the throw. */
  pending: PendingRoll | null;
  /** Initiative loaded into the cup (mutually exclusive with `pending`). */
  initiative: PendingInitiative | null;
  /** Attack loaded into the cup (stage 16). */
  attack: PendingAttack | null;
  /** Evasion loaded into the cup (stage 16). */
  evasion: PendingEvasion | null;
  /** Last dialog choices, reused for the next roll (and by Shift+click). */
  lastModifier: number;
  lastVisibility: 'public' | 'gm';
  /** Last aimed location of a damage roll (stage 15). */
  lastLocation: CpredHitLocation;

  openDialog: (target: RollTarget) => void;
  closeDialog: () => void;
  loadCup: (pending: PendingRoll) => void;
  loadInitiativeCup: (initiative: PendingInitiative) => void;
  loadAttackCup: (attack: PendingAttack) => void;
  loadEvasionCup: (evasion: PendingEvasion) => void;
  clearCup: () => void;
  remember: (modifier: number, visibility: 'public' | 'gm') => void;
  rememberLocation: (location: CpredHitLocation) => void;
}

/** Every slot of the cup, cleared. Spread it before setting the new one. */
const EMPTY_CUP = {
  pending: null,
  initiative: null,
  attack: null,
  evasion: null,
} as const;

export const useRollStore = create<RollStoreState>((set) => ({
  target: null,
  pending: null,
  initiative: null,
  attack: null,
  evasion: null,
  lastModifier: 0,
  lastVisibility: 'public',
  lastLocation: 'body',

  openDialog: (target) => set({ target }),
  closeDialog: () => set({ target: null }),
  // Only one thing can sit in the cup at a time — loading anything empties it.
  loadCup: (pending) => set({ ...EMPTY_CUP, pending, target: null }),
  loadInitiativeCup: (initiative) => set({ ...EMPTY_CUP, initiative, target: null }),
  loadAttackCup: (attack) => set({ ...EMPTY_CUP, attack, target: null }),
  loadEvasionCup: (evasion) => set({ ...EMPTY_CUP, evasion, target: null }),
  clearCup: () => set({ ...EMPTY_CUP }),
  remember: (lastModifier, lastVisibility) => set({ lastModifier, lastVisibility }),
  rememberLocation: (lastLocation) => set({ lastLocation }),
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
  const isCheck = target.kind === 'skill' || target.kind === 'stat';
  const request: CpredRollRequest = {
    kind: target.kind,
    ...(target.skillId ? { skillId: target.skillId } : {}),
    ...(target.statId ? { statId: target.statId } : {}),
    ...(target.weaponRowId ? { weaponRowId: target.weaponRowId } : {}),
    ...(target.kind === 'damage' ? { location: store.lastLocation } : {}),
    // Damage and Death Saves take no situational modifier by default: the
    // remembered check modifier must not silently ride along.
    modifier: isCheck ? store.lastModifier : 0,
    luckSpent: 0,
  };
  const planned = planCpredRoll(data, registry, request);
  if (!planned.ok) return;
  store.loadCup({
    ...target,
    request,
    // A damage roll or a Death Save is always public: the table needs to see
    // what happened to the target.
    visibility: isCheck ? store.lastVisibility : 'public',
    title: planned.plan.title,
    modifierTotal: planned.plan.modifierTotal,
  });
}

/** Loads a Death Save into the cup — no dialog, the rules leave no choices. */
export function loadDeathSaveCup(
  characterId: string,
  characterName: string,
  data: CpredCharacterData,
  registry: CpredRegistry,
): void {
  quickLoadCup({ characterId, characterName, kind: 'deathSave' }, data, registry);
}
