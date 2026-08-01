/**
 * What one figure can do this turn, as a row of slots (stage 16f).
 *
 * The action bar of the combat HUD is generated, never configured: it lists
 * what the selected token *is able to do* right now — its weapons with the fire
 * modes they actually offer, a reload when there is a magazine, and the handful
 * of catalogue actions worth a key. Nothing here is new rules. Every slot points
 * at machinery that already exists (`planCpredAttack`, `spendCpredTurn`,
 * `weapon:reload`), and the refusals it carries are the ones the server would
 * give anyway — said *before* the click instead of after it.
 *
 * Pure on purpose, and in `shared` rather than in the component, because „which
 * fire modes does this weapon have" and „does Powalony stop me running" are
 * rules questions. The UI's job is to draw nine boxes.
 */

import type { CpredCharacterData, CpredWeaponRow } from './character.js';
import type { ResolvedWeapon } from './compendium.js';
import type { CpredCombatProfile } from './statist.js';
import { STATIST_WEAPON_ROW_ID } from './statist.js';
import {
  CPRED_ATTACK_MODE_LABELS,
  CPRED_ATTACK_MODE_SHORT,
  CPRED_BURST_AMMO_COST,
  type CpredAttackMode,
} from './attacks.js';
import { cpredActionBlock, cpredMovementBlock } from './statuses.js';
import {
  CPRED_ACTION_GRAPPLE,
  CPRED_ACTION_HOLD,
  CPRED_ACTION_RUN,
  CPRED_ACTION_STABILIZE,
  CPRED_ACTION_STAND_UP,
  cpredAction,
} from './turn.js';

/** One thing a token can attack with, whatever the numbers come from. */
export interface CpredWeaponOption {
  /** Weapon row on the sheet, or the statist's single synthesised row. */
  rowId: string;
  name: string;
  resolved: ResolvedWeapon | null;
  /** Rounds left / magazine size; null for a weapon that counts none. */
  ammo: { current: number; max: number } | null;
}

/** Compendium lookup the caller supplies — the registry lives in its store. */
export type CpredWeaponResolver = (
  compendiumId: string | null | undefined,
) => ResolvedWeapon | null;

/**
 * The weapons a token can fire: its sheet's rows, or the single weapon of its
 * combat profile (stage 16b). Empty when it has neither, which is what „this
 * token has not been statted" looks like from here.
 */
export function cpredWeaponOptions(
  sheet: Pick<CpredCharacterData, 'weapons'> | null,
  profile: CpredCombatProfile | null,
  resolve: CpredWeaponResolver,
): CpredWeaponOption[] {
  if (sheet) {
    return sheet.weapons.map((row: CpredWeaponRow) => ({
      rowId: row.id,
      name: row.name,
      resolved: resolve(row.compendiumId),
      ammo: row.ammoMax > 0 ? { current: row.ammoCurrent, max: row.ammoMax } : null,
    }));
  }
  if (!profile) return [];
  return [
    {
      rowId: STATIST_WEAPON_ROW_ID,
      name: profile.weaponName,
      resolved: resolve(profile.weaponId),
      ammo: profile.ammoMax > 0 ? { current: profile.ammoCurrent, max: profile.ammoMax } : null,
    },
  ];
}

/**
 * The fire modes a weapon actually offers. A pistol shows one slot and no
 * choice to make; only a weapon with a burst grows the row.
 */
export function cpredFireModes(resolved: ResolvedWeapon | null): CpredAttackMode[] {
  const modes: CpredAttackMode[] = ['single'];
  if (resolved?.autofire) modes.push('autofire');
  if (resolved?.suppressive) modes.push('suppressive');
  return modes;
}

/** Catalogue actions worth a key, in the order they appear on the bar. */
export const CPRED_HOTBAR_ACTION_IDS: readonly string[] = [
  CPRED_ACTION_STABILIZE,
  CPRED_ACTION_GRAPPLE,
  CPRED_ACTION_HOLD,
  CPRED_ACTION_STAND_UP,
  CPRED_ACTION_RUN,
];

/** Slots that get a `1`–`9` key; the rest of the bar is mouse-only. */
export const CPRED_HOTBAR_KEYED_SLOTS = 9;

/** A weapon in one of its fire modes — clicking a target loads the cup. */
export interface CpredHotbarWeaponSlot {
  kind: 'weapon';
  /** The weapon's own name, with nothing appended. */
  label: string;
  id: string;
  hint: string;
  weaponRowId: string;
  mode: CpredAttackMode;
  /**
   * „seria", „zapora" — null for a plain shot.
   *
   * Kept apart from the label rather than glued onto it, because the fire mode
   * is exactly the part that distinguishes three otherwise identical slots, and
   * a long weapon name would truncate it away („Ciężki pistolet maszynow…").
   */
  modeLabel: string | null;
  melee: boolean;
  /**
   * Aimed at a patch of ground rather than at a figure (stage 16d).
   *
   * True for anything that explodes, because the rules centre the blast on a
   * square: „twój cel (pole 2x2 metry, nie osoba)" (s. 174). A thrown knife is
   * *not* this — it is let go of at a person, and only the skill changes.
   */
  pointTarget: boolean;
  /** Thrown by hand — the roll is ZW + Atletyka, not REF + weapon (s. 177). */
  thrown: boolean;
  /** Rounds left / magazine size, for the badge; null when none are counted. */
  ammo: { current: number; max: number } | null;
  /** Why it cannot be used right now, or null. */
  disabled: string | null;
  /** `'1'`–`'9'`, or null past the ninth slot. */
  key: string | null;
}

/** Refilling a magazine — its own event, and it books its own Action. */
export interface CpredHotbarReloadSlot {
  kind: 'reload';
  id: string;
  label: string;
  hint: string;
  weaponRowId: string;
  ammo: { current: number; max: number };
  disabled: string | null;
  key: string | null;
}

/** A catalogue action (14b). Some spend, some open a form — the UI decides. */
export interface CpredHotbarActionSlot {
  kind: 'action';
  id: string;
  label: string;
  hint: string;
  actionId: string;
  /** The action needs a target or a declaration before it can be booked. */
  needsForm: boolean;
  disabled: string | null;
  key: string | null;
}

export type CpredHotbarSlot = CpredHotbarWeaponSlot | CpredHotbarReloadSlot | CpredHotbarActionSlot;

/** Everything the bar reads. All of it is state somebody else already owns. */
export interface CpredHotbarInput {
  /** Sheet of the selected token; null falls back to the combat profile. */
  sheet: Pick<CpredCharacterData, 'weapons'> | null;
  profile: CpredCombatProfile | null;
  resolve: CpredWeaponResolver;
  /** Status ids on the token — Powalony, Trzymany, Nieprzytomny… */
  statuses: readonly string[];
  /**
   * Is this participant in a fight, and has their Action already gone? Absent
   * outside combat, where weapons still work and no budget is charged.
   */
  turn: { actionSpent: boolean; moveSpent: boolean } | null;
  /**
   * The GM is never blocked by a budget (stage 14b logs the overspend and lets
   * it through), so their slots stay live. A status still greys them out —
   * that is a fact about the figure, not about whose turn it is.
   */
  isGm: boolean;
  /** Side of a Hold this participant is on, if any (stage 14d). */
  grapple?: 'attacker' | 'defender' | null;
}

/** Reason a weapon cannot fire right now, or null. */
function weaponRefusal(
  option: CpredWeaponOption,
  mode: CpredAttackMode,
  actionBlock: string | null,
): string | null {
  if (actionBlock) return actionBlock;
  const ammo = option.ammo;
  if (!ammo) return null;
  const cost = mode === 'single' ? 1 : CPRED_BURST_AMMO_COST;
  if (ammo.current < cost) {
    return mode === 'single'
      ? 'Pusty magazynek — przeładuj.'
      : `Za mało amunicji na serię (${CPRED_BURST_AMMO_COST} naboi).`;
  }
  return null;
}

/**
 * Builds the bar for one token.
 *
 * The order is the order of a turn as it is actually played: what I shoot with,
 * how I reload it, then the handful of things I might do instead of shooting.
 * Weapons first is not a preference — the keys `1`–`9` are worth most to the
 * thing pressed every round.
 */
export function hotbarSlotsFor(input: CpredHotbarInput): CpredHotbarSlot[] {
  const options = cpredWeaponOptions(input.sheet, input.profile, input.resolve);
  const statusActionBlock = cpredActionBlock(input.statuses);
  const statusMoveBlock = cpredMovementBlock(input.statuses);
  // Outside a fight there is no budget to run out of, and the GM is never
  // refused one (14b). Both cases leave only the statuses to say no.
  const budgetSpent = !input.isGm && input.turn?.actionSpent === true;
  const noAction = 'Akcja w tej turze już wykorzystana.';
  const actionRefusal = statusActionBlock ?? (budgetSpent ? noAction : null);

  const slots: CpredHotbarSlot[] = [];

  for (const option of options) {
    const pointTarget = option.resolved?.explosive === true;
    const thrown = option.resolved?.thrown === true;
    for (const mode of cpredFireModes(option.resolved)) {
      slots.push({
        kind: 'weapon',
        id: `weapon:${option.rowId}:${mode}`,
        label: option.name,
        modeLabel: CPRED_ATTACK_MODE_SHORT[mode],
        hint: pointTarget
          ? `${option.name} — kliknij pole na mapie, żeby wyznaczyć środek wybuchu`
          : mode === 'single'
            ? `${option.name} — kliknij cel na mapie, żeby załadować kubek`
            : `${option.name}: ${CPRED_ATTACK_MODE_LABELS[mode]} — kliknij cel na mapie`,
        weaponRowId: option.rowId,
        mode,
        melee: option.resolved?.melee ?? false,
        pointTarget,
        thrown,
        ammo: option.ammo,
        disabled: weaponRefusal(option, mode, actionRefusal),
        key: null,
      });
    }
  }

  // Only a sheet can be reloaded: `weapon:reload` writes a magazine back to a
  // character row, and a statist has no row to write to. Their gun is refilled
  // by the GM in „Edytuj…", which is the same place its magazine was set.
  for (const option of input.sheet ? options : []) {
    if (!option.ammo) continue;
    slots.push({
      kind: 'reload',
      id: `reload:${option.rowId}`,
      label: `Przeładuj: ${option.name}`,
      hint: `Ładuje magazynek do pełna (${option.ammo.current}/${option.ammo.max}). Kosztuje Akcję.`,
      weaponRowId: option.rowId,
      ammo: option.ammo,
      disabled: option.ammo.current >= option.ammo.max ? 'Magazynek jest pełny.' : actionRefusal,
      key: null,
    });
  }

  for (const actionId of CPRED_HOTBAR_ACTION_IDS) {
    const definition = cpredAction(actionId);
    if (!definition) continue;
    slots.push({
      kind: 'action',
      id: `action:${actionId}`,
      // One slot, three faces (stage 14d): whoever is Held wrestles, whoever
      // is holding chokes or throws, everybody else grabs. The catalogue keeps
      // those apart as separate actions; the bar shows the one that applies,
      // and the form behind it offers exactly that side's buttons.
      label:
        actionId === CPRED_ACTION_GRAPPLE
          ? input.grapple === 'defender'
            ? 'Wyrwij się'
            : input.grapple === 'attacker'
              ? 'Zwarcie'
              : definition.name
          : definition.name,
      hint: definition.hint,
      actionId,
      needsForm: actionId !== CPRED_ACTION_STAND_UP && actionId !== CPRED_ACTION_RUN,
      disabled: actionSlotRefusal(actionId, input, actionRefusal, statusMoveBlock),
      key: null,
    });
  }

  return slots.map((slot, index) => ({
    ...slot,
    key: index < CPRED_HOTBAR_KEYED_SLOTS ? String(index + 1) : null,
  }));
}

/**
 * Why a catalogue action is greyed out.
 *
 * Two exceptions carry the whole of the function. **Wstanie** must survive the
 * movement block: being Powalony is exactly the reason to press it, and a
 * button disabled by the condition it cures is a dead end. **Bieg** takes both
 * blocks plus the rule the catalogue itself states — RAW grants the second Move
 * Action only after the first has been used.
 */
function actionSlotRefusal(
  actionId: string,
  input: CpredHotbarInput,
  actionRefusal: string | null,
  moveBlock: string | null,
): string | null {
  if (actionId === CPRED_ACTION_STAND_UP) return actionRefusal;
  if (actionId === CPRED_ACTION_RUN) {
    if (actionRefusal) return actionRefusal;
    if (moveBlock) return moveBlock;
    if (input.turn && !input.turn.moveSpent && !input.isGm) {
      return 'Bieg wymaga wcześniejszego wykonania Akcji Ruchu w tej turze.';
    }
    return null;
  }
  return actionRefusal;
}
