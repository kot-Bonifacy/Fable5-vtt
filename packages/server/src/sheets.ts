import type {
  CompendiumEntry,
  CpredCharacterData,
  CpredHitLocation,
  CpredRegistry,
  DamageLogEntry,
  DiceRng,
  TokenHp,
} from '@vtt/shared';
import {
  CPRED_HIT_LOCATIONS,
  CPRED_STAT_LABELS,
  applyWoundStatuses,
  drawCriticalInjury,
  effectiveArmor,
  hitLocationLabel,
  hpMax,
  isCriticalInjuryEntry,
  mergeCharacterData,
  parseCharacterData,
  resolveCpredDamage,
  toCriticalInjuryRow,
  woundTransitionLabel,
} from '@vtt/shared';
import type { Character } from './generated/prisma/client.js';

/**
 * Bridge between the VTT core (tokens) and the active game system's sheet.
 *
 * The token layer only ever asks "what are this sheet's HP" and "write these
 * HP back" — every CP RED specific detail (where HP live in the JSON, how the
 * maximum is derived) stays here, so adding another RPG system later means
 * adding a branch in this file, not in the core.
 */

/**
 * The data registry sheets are parsed against. Aliased here so the core token
 * layer never names the game system it is currently bridging to.
 */
export type SheetRegistry = CpredRegistry;

/** Current/max HP of a linked sheet, plus who owns it (visibility rule). */
export interface LinkedSheet {
  hp: TokenHp;
  ownerId: string | null;
}

/**
 * What the combat tracker needs from a sheet to roll initiative (stage 14).
 * The tracker itself only knows „1d10 plus this modifier, ties broken by that
 * value" — CP RED fills both with REF.
 */
export interface SheetInitiative {
  modifier: number;
  /** Secondary sort for equal totals; CP RED breaks ties by REF. */
  tieBreak: number;
  /** Shown on the chat card so the roll explains itself. */
  label: string;
}

/** Initiative inputs of a linked sheet — CP RED: `1d10 + REF`. */
export function readSheetInitiative(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
): SheetInitiative {
  const data = parseCharacterData(character.data, registry);
  const ref = data.stats.ref;
  return {
    modifier: ref,
    tieBreak: ref,
    label: `${CPRED_STAT_LABELS.ref.name} (${CPRED_STAT_LABELS.ref.abbr})`,
  };
}

/** Reads the sheet's HP pair: current from the data, max derived from stats. */
export function readSheetHp(character: Character, registry: SheetRegistry): TokenHp {
  const data = parseCharacterData(character.data, registry);
  return { current: data.hpCurrent, max: hpMax(data.stats) };
}

export function toLinkedSheet(character: Character, registry: SheetRegistry): LinkedSheet {
  return { hp: readSheetHp(character, registry), ownerId: character.ownerId };
}

/**
 * Applies a new current-HP value to the sheet payload, clamped to the derived
 * maximum. Returns the serialized data column (the caller persists it) and
 * the resulting HP pair.
 */
export function writeSheetHp(
  character: Character,
  hpCurrent: number,
  registry: SheetRegistry,
): { data: string; hp: TokenHp } {
  const current = parseCharacterData(character.data, registry);
  const max = hpMax(current.stats);
  const clamped = Math.min(Math.max(Math.round(hpCurrent), 0), max);
  const merged = mergeCharacterData(current, { hpCurrent: clamped });
  return { data: JSON.stringify(merged), hp: { current: merged.hpCurrent, max } };
}

/* ------------------------------------------------------------------ *
 * Damage (stage 15). The core damage flow only knows "a hit landed on
 * this target"; armor locations, ablation, injury tables and wound
 * statuses are all CP RED and stay behind this seam.
 * ------------------------------------------------------------------ */

/** One hit, as the core hands it to the system. */
export interface SheetDamageRequest {
  /** Total rolled on the damage dice. */
  damage: number;
  /** Two or more sixes came up — a Critical Injury was scored. */
  criticalInjury: boolean;
  location: string;
  /** GM override of the SP protecting the target (statists, cover…). */
  armorSp?: number;
  ignoreArmor?: boolean;
}

/** The part of the chat log the system fills in. */
export type SheetDamageLog = Omit<
  DamageLogEntry,
  'targetTokenId' | 'targetName' | 'sourceMessageId' | 'targetOwnerId' | 'characterId'
>;

export function isValidHitLocation(value: unknown): value is CpredHitLocation {
  return typeof value === 'string' && (CPRED_HIT_LOCATIONS as readonly string[]).includes(value);
}

function normalizeLocation(value: string): CpredHitLocation {
  return isValidHitLocation(value) ? value : 'body';
}

/** Status ids a token with these HP should carry (wound thresholds). */
export function sheetWoundStatuses(statuses: readonly string[], hp: TokenHp | null): string[] {
  if (!hp) return [...statuses];
  return applyWoundStatuses(statuses, hp.current, hp.max);
}

/**
 * Applies a hit to a character sheet: armor stops what it can, the head
 * multiplier doubles the rest, HP drop, the hit armor ablates and a Critical
 * Injury is drawn from the campaign's table when the dice called for one.
 */
export function applyDamageToSheet(
  character: Character,
  registry: SheetRegistry,
  request: SheetDamageRequest,
  injuries: readonly CompendiumEntry[],
  rng: DiceRng,
): { data: string; hp: TokenHp; log: SheetDamageLog } {
  const data = parseCharacterData(character.data, registry);
  const location = normalizeLocation(request.location);
  const max = hpMax(data.stats);
  const armorRow = effectiveArmor(data.armor, location);
  const armorSp = request.armorSp ?? armorRow?.spCurrent ?? 0;

  const outcome = resolveCpredDamage({
    damage: request.damage,
    location,
    armorSp,
    hpCurrent: data.hpCurrent,
    hpMax: max,
    criticalInjury: request.criticalInjury,
    ignoreArmor: request.ignoreArmor,
  });

  const patch: Partial<CpredCharacterData> = { hpCurrent: outcome.hpAfter };
  // Only the piece that actually stopped something ablates, and only when the
  // GM did not override the SP with a number of their own.
  const ablatedRow = outcome.ablated && armorRow && request.armorSp === undefined ? armorRow : null;
  if (ablatedRow) {
    patch.armor = data.armor.map((row) =>
      row.id === ablatedRow.id ? { ...row, spCurrent: outcome.spAfter } : row,
    );
  }

  const log: SheetDamageLog = {
    location,
    locationLabel: hitLocationLabel(location),
    damageRolled: outcome.damageRolled,
    armorSp: outcome.armorSp,
    damageThrough: outcome.damageThrough,
    doubled: outcome.doubled,
    bonusDamage: outcome.bonusDamage,
    hpLost: outcome.hpLost,
    hp: { before: outcome.hpBefore, after: outcome.hpAfter, max },
    ...(ablatedRow
      ? {
          armor: {
            rowId: ablatedRow.id,
            name: ablatedRow.name,
            before: outcome.spBefore,
            after: outcome.spAfter,
          },
        }
      : {}),
    ...(woundTransitionLabel(outcome) ? { woundLabel: woundTransitionLabel(outcome)! } : {}),
  };

  if (outcome.criticalInjury) {
    const pool = injuries.filter(isCriticalInjuryEntry);
    const draw = drawCriticalInjury(
      pool,
      location,
      rng,
      data.criticalInjuries.map((injury) => injury.id),
    );
    const rolled = draw.rolls[draw.rolls.length - 1]?.total ?? 0;
    if (draw.entry) {
      const row = toCriticalInjuryRow(draw.entry, rolled);
      patch.criticalInjuries = [...data.criticalInjuries, row];
      log.injury = { id: row.id, name: row.name, effect: row.effect, rolled };
    } else if (draw.exhausted) {
      log.injuryNote = 'Cel ma już wszystkie rany z tej tabeli.';
    } else {
      log.injuryNote = `Brak wpisu na ${rolled} w tabeli ran (${hitLocationLabel(location)}) — uzupełnij kompendium.`;
    }
  }

  const merged = mergeCharacterData(data, patch);
  return {
    data: JSON.stringify(merged),
    hp: { current: merged.hpCurrent, max },
    log,
  };
}

/** The same hit against a statist token that only has its own HP pair. */
export function applyDamageToTokenHp(
  hp: TokenHp,
  request: SheetDamageRequest,
): { hp: TokenHp; log: SheetDamageLog } {
  const location = normalizeLocation(request.location);
  const outcome = resolveCpredDamage({
    damage: request.damage,
    location,
    armorSp: request.armorSp ?? 0,
    hpCurrent: hp.current,
    hpMax: hp.max,
    criticalInjury: request.criticalInjury,
    ignoreArmor: request.ignoreArmor,
  });
  const log: SheetDamageLog = {
    location,
    locationLabel: hitLocationLabel(location),
    damageRolled: outcome.damageRolled,
    armorSp: outcome.armorSp,
    damageThrough: outcome.damageThrough,
    doubled: outcome.doubled,
    bonusDamage: outcome.bonusDamage,
    hpLost: outcome.hpLost,
    hp: { before: outcome.hpBefore, after: outcome.hpAfter, max: hp.max },
    ...(woundTransitionLabel(outcome) ? { woundLabel: woundTransitionLabel(outcome)! } : {}),
    // A statist has no sheet to carry an injury — the GM plays it out by hand.
    ...(outcome.criticalInjury
      ? { injuryNote: 'Cel bez karty postaci — ranę krytyczną rozegraj ręcznie.' }
      : {}),
  };
  return { hp: { current: outcome.hpAfter, max: hp.max }, log };
}

/**
 * Puts a sheet back the way it was before an applied hit: HP, the ablated
 * armor piece and the Critical Injury that was drawn. Anything the GM changed
 * in between (a repair, a heal) is overwritten for those fields only.
 */
export function undoDamageOnSheet(
  character: Character,
  registry: SheetRegistry,
  entry: DamageLogEntry,
): { data: string; hp: TokenHp } {
  const data = parseCharacterData(character.data, registry);
  const max = hpMax(data.stats);
  const patch: Partial<CpredCharacterData> = {};
  if (entry.hp) patch.hpCurrent = entry.hp.before;
  if (entry.armor) {
    patch.armor = data.armor.map((row) =>
      row.id === entry.armor!.rowId ? { ...row, spCurrent: entry.armor!.before } : row,
    );
  }
  if (entry.injury) {
    // Remove one instance of the drawn injury, not every injury of that id.
    const index = data.criticalInjuries.findIndex((injury) => injury.id === entry.injury!.id);
    if (index >= 0) {
      patch.criticalInjuries = data.criticalInjuries.filter((_, position) => position !== index);
    }
  }
  const merged = mergeCharacterData(data, patch);
  return { data: JSON.stringify(merged), hp: { current: merged.hpCurrent, max } };
}
