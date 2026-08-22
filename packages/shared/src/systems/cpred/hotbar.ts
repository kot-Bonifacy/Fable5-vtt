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

import { loadedAmmoFor, type CpredAmmoProfile } from './ammo.js';
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
  CPRED_ACTION_SCANNER,
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
  /** The round loaded, when it is anything but ordinary (stage 16g). */
  ammoProfile?: CpredAmmoProfile | null;
}

/** Compendium lookup the caller supplies — the registry lives in its store. */
export type CpredWeaponResolver = (
  compendiumId: string | null | undefined,
) => ResolvedWeapon | null;

/** The same, for ammunition ids (stage 16g). */
export type CpredAmmoResolver = (ammoId: string) => CpredAmmoProfile | null;

/**
 * The weapons a token can fire: its sheet's rows, or the single weapon of its
 * combat profile (stage 16b). Empty when it has neither, which is what „this
 * token has not been statted" looks like from here.
 */
export function cpredWeaponOptions(
  sheet: Pick<CpredCharacterData, 'weapons'> | null,
  profile: CpredCombatProfile | null,
  resolve: CpredWeaponResolver,
  resolveAmmo?: CpredAmmoResolver,
): CpredWeaponOption[] {
  const lookup: CpredAmmoResolver = resolveAmmo ?? (() => null);
  if (sheet) {
    return sheet.weapons.map((row: CpredWeaponRow) => {
      const resolved = resolve(row.compendiumId);
      return {
        rowId: row.id,
        name: row.name,
        resolved,
        ammo: row.ammoMax > 0 ? { current: row.ammoCurrent, max: row.ammoMax } : null,
        ammoProfile: loadedAmmoFor(row, resolved, lookup),
      };
    });
  }
  if (!profile) return [];
  const resolved = resolve(profile.weaponId);
  return [
    {
      rowId: STATIST_WEAPON_ROW_ID,
      name: profile.weaponName,
      resolved,
      ammo: profile.ammoMax > 0 ? { current: profile.ammoCurrent, max: profile.ammoMax } : null,
      // A statist's gun is loaded with whatever its weapon type fires and
      // nothing else: nobody edits an extra's magazine, so only the „this
      // weapon takes one kind of round" case can apply.
      ammoProfile: loadedAmmoFor({}, resolved, lookup),
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

/**
 * Pictures a slot may wear (stage 27h).
 *
 * Names of *things*, not of files: the client owns the artwork and only needs
 * to be told what the slot is holding. The list is deliberately short — three
 * kinds of pistol share one silhouette, because at 18 px the difference between
 * them is invisible and the name underneath already says which one it is.
 */
export type CpredSlotIcon =
  | 'pistol'
  | 'revolver'
  | 'smg'
  | 'smg-heavy'
  | 'rifle'
  | 'sniper'
  | 'shotgun'
  | 'flamethrower'
  | 'grenade'
  | 'launcher'
  | 'rocket'
  | 'crossbow'
  | 'bow'
  | 'knife'
  | 'sword'
  | 'broadsword'
  | 'two-handed-sword'
  | 'fist'
  | 'martial-arts'
  | 'reload'
  | 'first-aid'
  | 'grab'
  | 'hourglass'
  | 'stand-up'
  | 'run'
  | 'scanner';

/** Weapon type id (last segment) → picture. */
const WEAPON_TYPE_ICONS: Readonly<Record<string, CpredSlotIcon>> = {
  'very-heavy-pistol': 'revolver',
  'heavy-pistol': 'pistol',
  'medium-pistol': 'pistol',
  'submachine-gun': 'smg',
  'heavy-submachine-gun': 'smg-heavy',
  'assault-rifle': 'rifle',
  'sniper-rifle': 'sniper',
  shotgun: 'shotgun',
  flamethrower: 'flamethrower',
  grenade: 'grenade',
  'grenade-launcher': 'launcher',
  'rocket-launcher': 'rocket',
  crossbow: 'crossbow',
  bow: 'bow',
  'light-melee': 'knife',
  'medium-melee': 'sword',
  'heavy-melee': 'broadsword',
  'very-heavy-melee': 'two-handed-sword',
  brawling: 'fist',
  'martial-arts': 'martial-arts',
};

/** Skill the weapon fires with → picture, for a type nobody has mapped. */
const SKILL_ICONS: Readonly<Record<string, CpredSlotIcon>> = {
  handgun: 'pistol',
  'shoulder-arms': 'rifle',
  'heavy-weapons': 'launcher',
  archery: 'bow',
  'melee-weapon': 'sword',
  brawling: 'fist',
  'martial-arts': 'martial-arts',
  athletics: 'grenade',
};

/**
 * What to draw on a weapon slot.
 *
 * Three rungs, each one a step further from certainty: the weapon type the
 * compendium named, the skill it is fired with, and finally what the weapon
 * *does* — because a homebrew row with no type and no skill still explodes, is
 * still thrown, or is still swung, and any of those is a better picture than a
 * pistol nobody is holding.
 */
export function cpredWeaponIcon(resolved: ResolvedWeapon | null): CpredSlotIcon {
  const typeId = resolved?.typeId;
  if (typeId) {
    const tail = typeId.slice(typeId.lastIndexOf('.') + 1);
    const byType = WEAPON_TYPE_ICONS[tail];
    if (byType) return byType;
  }
  const bySkill = resolved?.skillId ? SKILL_ICONS[resolved.skillId] : undefined;
  if (bySkill) return bySkill;
  if (resolved?.explosive) return 'grenade';
  if (resolved?.thrown) return 'knife';
  if (resolved?.melee) return 'sword';
  return 'pistol';
}

/** Picture of a catalogue action; every hotbar action has one. */
const ACTION_ICONS: Readonly<Record<string, CpredSlotIcon>> = {
  [CPRED_ACTION_STABILIZE]: 'first-aid',
  [CPRED_ACTION_GRAPPLE]: 'grab',
  [CPRED_ACTION_HOLD]: 'hourglass',
  [CPRED_ACTION_STAND_UP]: 'stand-up',
  [CPRED_ACTION_RUN]: 'run',
  [CPRED_ACTION_SCANNER]: 'scanner',
};

/** Catalogue actions worth a key, in the order they appear on the bar. */
export const CPRED_HOTBAR_ACTION_IDS: readonly string[] = [
  CPRED_ACTION_STABILIZE,
  CPRED_ACTION_GRAPPLE,
  CPRED_ACTION_HOLD,
  CPRED_ACTION_STAND_UP,
  CPRED_ACTION_RUN,
];

/**
 * Actions only some figures have at all (stage 26b, fixed 22.08).
 *
 * The Scanner is an Akcja w Somie like any other — „w ramach Akcji w Somie
 * znajdujesz położenie punktów dostępu" (s. 199) — but it belongs to whoever
 * has an Interface and a deck to run it on, and to nobody else. It lived only
 * inside the access point's card until now, which made it unreachable by the
 * one thing it exists for: the first *hidden* socket, which is not on the map
 * until the Scanner finds it.
 */
export const CPRED_HOTBAR_NETRUNNER_ACTION_IDS: readonly string[] = [CPRED_ACTION_SCANNER];

/** Slots that get a `1`–`9` key; the rest of the bar is mouse-only. */
export const CPRED_HOTBAR_KEYED_SLOTS = 9;

/** A weapon in one of its fire modes — clicking a target loads the cup. */
export interface CpredHotbarWeaponSlot {
  kind: 'weapon';
  /** What the slot draws (stage 27h) — a thing, not a file name. */
  icon: CpredSlotIcon;
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
  /**
   * Name of the round loaded, when it is not ordinary ammunition (stage 16g).
   * On the slot rather than in the tooltip: „Strzelba · Śrut" and „Strzelba ·
   * Zapalająca" are two different attacks, and the difference is the point.
   */
  ammoLabel: string | null;
  /**
   * Reach of the cone this shot sprays, in metres — present only for spread
   * ammunition (stage 16g). The map draws the wedge from it; the click still
   * lands on a figure, exactly as an ordinary shot's does.
   */
  coneRangeM: number | null;
  /** Why it cannot be used right now, or null. */
  disabled: string | null;
  /** `'1'`–`'9'`, or null past the ninth slot. */
  key: string | null;
}

/** Refilling a magazine — its own event, and it books its own Action. */
export interface CpredHotbarReloadSlot {
  kind: 'reload';
  icon: CpredSlotIcon;
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
  icon: CpredSlotIcon;
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
  /** Ammunition lookup (stage 16g); without it every gun reads as ordinary. */
  resolveAmmo?: CpredAmmoResolver;
  /** Status ids on the token — Powalony, Trzymany, Nieprzytomny… */
  statuses: readonly string[];
  /**
   * Is this participant in a fight, and has their Action already gone? Absent
   * outside combat, where weapons still work and no budget is charged.
   *
   * `blockedAction` / `blockedMove` are the sentences a wound or a status left
   * on the turn itself (stage 14e) — „Uraz kręgosłupa: …". They are a different
   * thing from a resource that was *spent*, and the slot has to say which:
   * a greyed button reading „Akcja w tej turze już wykorzystana" sends a player
   * looking for the Action they never got to use.
   */
  turn: {
    actionSpent: boolean;
    moveSpent: boolean;
    blockedAction?: string | null;
    blockedMove?: string | null;
  } | null;
  /**
   * The GM is never blocked by a budget (stage 14b logs the overspend and lets
   * it through), so their slots stay live. A status still greys them out —
   * that is a fact about the figure, not about whose turn it is.
   */
  isGm: boolean;
  /** Side of a Hold this participant is on, if any (stage 14d). */
  grapple?: 'attacker' | 'defender' | null;
  /**
   * This sheet can run the Net (stage 26b): an Interface rank *and* a cyberdeck,
   * which is exactly what the server demands before it will scan. Adds the
   * Scanner slot; everything else on the bar is unaffected.
   */
  netrunner?: boolean;
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
  const options = cpredWeaponOptions(input.sheet, input.profile, input.resolve, input.resolveAmmo);
  const statusActionBlock = cpredActionBlock(input.statuses);
  const statusMoveBlock = cpredMovementBlock(input.statuses);
  // Outside a fight there is no budget to run out of, and the GM is never
  // refused one (14b). Both cases leave only the statuses to say no.
  const budgetSpent = !input.isGm && input.turn?.actionSpent === true;
  const noAction = 'Akcja w tej turze już wykorzystana.';
  // Order is the order of truth: a status refuses first, then the wound that
  // took the Action away before the turn began, and only then the budget. The
  // last one is the only sentence that is about *spending*, and putting it
  // first is how a blocked figure ended up being told it had already acted.
  const actionRefusal =
    statusActionBlock ?? input.turn?.blockedAction ?? (budgetSpent ? noAction : null);
  const moveRefusal = statusMoveBlock ?? input.turn?.blockedMove ?? null;

  const slots: CpredHotbarSlot[] = [];

  for (const option of options) {
    const pointTarget = option.resolved?.explosive === true;
    const thrown = option.resolved?.thrown === true;
    const spread = option.ammoProfile?.spread;
    for (const mode of cpredFireModes(option.resolved)) {
      slots.push({
        kind: 'weapon',
        icon: cpredWeaponIcon(option.resolved),
        id: `weapon:${option.rowId}:${mode}`,
        label: option.name,
        modeLabel: CPRED_ATTACK_MODE_SHORT[mode],
        hint: pointTarget
          ? `${option.name} — kliknij pole na mapie, żeby wyznaczyć środek wybuchu`
          : spread && mode === 'single'
            ? `${option.name}: ${option.ammoProfile!.name} — stożek ${spread.coneRangeM} m przed tobą, PT ${spread.dv}`
            : mode === 'single'
              ? `${option.name} — kliknij cel na mapie, żeby załadować kubek`
              : `${option.name}: ${CPRED_ATTACK_MODE_LABELS[mode]} — kliknij cel na mapie`,
        weaponRowId: option.rowId,
        mode,
        melee: option.resolved?.melee ?? false,
        pointTarget,
        thrown,
        ammo: option.ammo,
        ammoLabel: option.ammoProfile?.name ?? null,
        coneRangeM: spread && mode === 'single' ? spread.coneRangeM : null,
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
      icon: 'reload',
      id: `reload:${option.rowId}`,
      label: `Przeładuj: ${option.name}`,
      hint: `Ładuje magazynek do pełna (${option.ammo.current}/${option.ammo.max}). Kosztuje Akcję.`,
      weaponRowId: option.rowId,
      ammo: option.ammo,
      disabled: option.ammo.current >= option.ammo.max ? 'Magazynek jest pełny.' : actionRefusal,
      key: null,
    });
  }

  const actionIds = input.netrunner
    ? [...CPRED_HOTBAR_ACTION_IDS, ...CPRED_HOTBAR_NETRUNNER_ACTION_IDS]
    : CPRED_HOTBAR_ACTION_IDS;
  for (const actionId of actionIds) {
    const definition = cpredAction(actionId);
    if (!definition) continue;
    slots.push({
      kind: 'action',
      icon: ACTION_ICONS[actionId] ?? 'hourglass',
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
      needsForm:
        actionId !== CPRED_ACTION_STAND_UP &&
        actionId !== CPRED_ACTION_RUN &&
        actionId !== CPRED_ACTION_SCANNER,
      disabled: actionSlotRefusal(actionId, input, actionRefusal, moveRefusal),
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

/**
 * One weapon on the panel, with the fire modes it offers folded inside it
 * (stage 27h decision, 20.08).
 *
 * The flat list above stays exactly as it was, because it has a second reader:
 * a bot's turn (`bot-combat.ts`) hands the model „Arasaka Minami 10 · seria" as
 * one choice, and splitting weapon from mode there would mean asking a language
 * model two questions where one will do. What changed is the *panel*: three
 * boxes for one gun made a character with a single weapon look like a character
 * with three, and burned three of the nine number keys on it.
 */
export interface CpredHotbarWeaponGroup {
  kind: 'weapon';
  /** Stable across mode changes — the weapon is what this row *is*. */
  id: string;
  label: string;
  icon: CpredSlotIcon;
  weaponRowId: string;
  /** The weapon's modes, in the order `cpredFireModes` gives them. Never empty. */
  modes: CpredHotbarWeaponSlot[];
  key: string | null;
}

/** A reload or a catalogue action — one thing, one box, nothing to fold. */
export interface CpredHotbarSingleGroup {
  kind: 'reload' | 'action';
  id: string;
  label: string;
  icon: CpredSlotIcon;
  slot: CpredHotbarSlot;
  key: string | null;
}

export type CpredHotbarGroup = CpredHotbarWeaponGroup | CpredHotbarSingleGroup;

/**
 * Folds the flat bar into what the panel draws.
 *
 * The number keys move here with it, and that is the point: they now count
 * *weapons*, so a character with one gun presses `1` whatever it is loaded
 * with, and `2` is the next real thing rather than the same gun again.
 *
 * Order is preserved — weapons in sheet order, then the reloads, then the
 * catalogue — because that is the order a turn is played in and the one the
 * keys were worth having in stage 16f.
 */
export function cpredHotbarGroups(slots: readonly CpredHotbarSlot[]): CpredHotbarGroup[] {
  const groups: CpredHotbarGroup[] = [];
  const weaponIndex = new Map<string, CpredHotbarWeaponGroup>();

  for (const slot of slots) {
    if (slot.kind === 'weapon') {
      const existing = weaponIndex.get(slot.weaponRowId);
      if (existing) {
        existing.modes.push(slot);
        continue;
      }
      const group: CpredHotbarWeaponGroup = {
        kind: 'weapon',
        id: `weapon:${slot.weaponRowId}`,
        label: slot.label,
        icon: slot.icon,
        weaponRowId: slot.weaponRowId,
        modes: [slot],
        key: null,
      };
      weaponIndex.set(slot.weaponRowId, group);
      groups.push(group);
      continue;
    }
    groups.push({
      kind: slot.kind,
      id: slot.id,
      label: slot.label,
      icon: slot.icon,
      slot,
      key: null,
    });
  }

  return groups.map((group, index) => ({
    ...group,
    key: index < CPRED_HOTBAR_KEYED_SLOTS ? String(index + 1) : null,
  }));
}

/**
 * The mode a weapon group should fire in, given what the user last picked.
 *
 * Falls back to the first mode rather than to `'single'`: the list comes from
 * the weapon itself, and a homebrew row that somehow offers no single shot must
 * still end up with something in hand. A remembered mode the weapon no longer
 * has — the round in the magazine changed, the row was edited — is dropped
 * rather than honoured.
 */
export function cpredWeaponModeSlot(
  group: CpredHotbarWeaponGroup,
  remembered: CpredAttackMode | undefined,
): CpredHotbarWeaponSlot {
  const wanted = remembered ? group.modes.find((slot) => slot.mode === remembered) : undefined;
  return wanted ?? group.modes[0]!;
}

/** The next mode in the ring, for the „cycle this weapon's fire mode" key. */
export function cpredNextWeaponMode(
  group: CpredHotbarWeaponGroup,
  current: CpredAttackMode,
): CpredAttackMode {
  const index = group.modes.findIndex((slot) => slot.mode === current);
  return group.modes[(index + 1) % group.modes.length]!.mode;
}
