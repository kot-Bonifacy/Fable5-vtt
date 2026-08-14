/**
 * The combat profile of a statist (stage 16b) — a token with no character sheet.
 *
 * The problem it solves: every rule in this project is written against
 * `CpredCharacterData`, and until now the only way to give a token any of them
 * was to build it a full sheet — ten stats, sixty-six skills, armour rows, Luck,
 * Humanity. A ganger who exists to fire three shots and fall over does not need
 * any of that, and the GM should not have to type it before the fight starts.
 *
 * So a statist carries a **profile**, not a sheet: the six numbers a firefight
 * actually reads, plus one weapon. Everything else is synthesised at the point
 * of use (`combatProfileSheet`), which is what keeps `planCpredAttack` and the
 * damage path single-track — there is no „statist branch" in the rules, only a
 * thinner source of the same data.
 *
 * Two things deliberately stay outside the profile:
 *
 *  - **hit points** live on the token, where they already were. A statist's HP
 *    bar is a core VTT feature that predates CP RED by ten stages, and having
 *    two homes for one number is how they drift apart;
 *  - **Luck, Humanity, Critical Injuries, the Death Save counter** — the parts
 *    of the sheet that describe a person with a story. A statist that starts
 *    needing them has stopped being a statist and wants a real sheet, which is
 *    two clicks away in the token menu.
 */

import { humanityMax } from './derived.js';
import { isValidCompendiumId } from './ids.js';
import { ARMOR_SP_MAX } from './locations.js';
import { CPRED_STAT_MAX, CPRED_STAT_MIN, type CpredStats } from './stats.js';
import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN, type CpredCharacterData } from './character.js';
import { CPRED_SCHEMA_VERSION } from './character.js';
import { CPRED_EVASION_SKILL_ID } from './attacks.js';
import { WEAPON_AMMO_MAX } from './character.js';
import { createDefaultLifepath } from './lifepath.js';

/** Longest weapon name a profile will store — the sheet's own limit. */
export const STATIST_WEAPON_NAME_MAX = 64;

/**
 * Stats a profile carries. Four of the ten, and the four are not arbitrary:
 * REF fires a gun, DEX swings and dodges, BODY decides bare-handed damage and
 * how much choking hurts, WILL answers suppressive fire. Everything else the
 * rules might reach for gets the statist default of 5 — the „average person"
 * rung the rulebook itself uses.
 */
export const STATIST_STAT_IDS = ['ref', 'dex', 'body', 'will'] as const;
export type StatistStatId = (typeof STATIST_STAT_IDS)[number];

/** The stat every unnamed stat of a statist takes. RAW's ordinary human. */
export const STATIST_DEFAULT_STAT = 5;

/**
 * One statist's fighting numbers, stored as JSON on the token.
 *
 * Opaque to the core VTT exactly the way `Combatant.turnState` is (stage 14b):
 * the token layer stores the string and never reads a field of it, because a
 * token that knew what a weapon was would tie the map renderer to Cyberpunk.
 */
export interface CpredCombatProfile {
  ref: number;
  dex: number;
  body: number;
  will: number;
  /**
   * Level of whichever skill the weapon fires with. One number rather than a
   * skill table: a statist has one weapon, and the skill that weapon uses comes
   * from the compendium entry, so naming it twice would let the two disagree.
   */
  skillLevel: number;
  /** Level of „Unik" — the defence half of the profile (stage 16b decision). */
  evasion: number;
  /** Worn armour's Stopping Power; 0 = unarmoured. Ablates like a sheet's. */
  armorSp: number;
  /** Compendium weapon this statist fires; null = unarmed. */
  weaponId: string | null;
  /** Display name of that weapon, copied like a sheet row copies its numbers. */
  weaponName: string;
  /** Damage notation of the weapon, copied for the same reason. */
  weaponDamage: string;
  ammoCurrent: number;
  ammoMax: number;
}

export function createDefaultCombatProfile(): CpredCombatProfile {
  return {
    ref: STATIST_DEFAULT_STAT,
    dex: STATIST_DEFAULT_STAT,
    body: STATIST_DEFAULT_STAT,
    will: STATIST_DEFAULT_STAT,
    skillLevel: 4,
    evasion: 2,
    armorSp: 0,
    weaponId: null,
    weaponName: 'Pięści',
    weaponDamage: '1k6',
    ammoCurrent: 0,
    ammoMax: 0,
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampText(value: unknown, max: number, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Reads a stored profile, repairing whatever it finds. Never throws and never
 * returns null for a malformed field: a token whose JSON column was hand-edited
 * has to keep working, and „this ganger has REF 0" is a worse table experience
 * than „this ganger has the default REF".
 */
export function sanitizeCombatProfile(raw: unknown): CpredCombatProfile {
  const base = createDefaultCombatProfile();
  if (typeof raw !== 'object' || raw === null) return base;
  const input = raw as Record<string, unknown>;
  const ammoMax = clampInt(input.ammoMax, 0, WEAPON_AMMO_MAX, base.ammoMax);
  return {
    ref: clampInt(input.ref, CPRED_STAT_MIN, CPRED_STAT_MAX, base.ref),
    dex: clampInt(input.dex, CPRED_STAT_MIN, CPRED_STAT_MAX, base.dex),
    body: clampInt(input.body, CPRED_STAT_MIN, CPRED_STAT_MAX, base.body),
    will: clampInt(input.will, CPRED_STAT_MIN, CPRED_STAT_MAX, base.will),
    skillLevel: clampInt(input.skillLevel, SKILL_LEVEL_MIN, SKILL_LEVEL_MAX, base.skillLevel),
    evasion: clampInt(input.evasion, SKILL_LEVEL_MIN, SKILL_LEVEL_MAX, base.evasion),
    armorSp: clampInt(input.armorSp, 0, ARMOR_SP_MAX, base.armorSp),
    weaponId:
      typeof input.weaponId === 'string' && isValidCompendiumId(input.weaponId)
        ? input.weaponId
        : null,
    weaponName: clampText(input.weaponName, STATIST_WEAPON_NAME_MAX, base.weaponName),
    weaponDamage: clampText(input.weaponDamage, 32, base.weaponDamage),
    ammoMax,
    // A magazine cannot hold more than it holds. Clamping here rather than at
    // the call sites is what lets the GM shrink a magazine on a loaded weapon
    // without leaving 30 rounds in a 12-round clip.
    ammoCurrent: Math.min(ammoMax, clampInt(input.ammoCurrent, 0, WEAPON_AMMO_MAX, ammoMax)),
  };
}

/** Parses the token's JSON column; null when the token has no profile at all. */
export function parseCombatProfile(raw: string | null | undefined): CpredCombatProfile | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return sanitizeCombatProfile(parsed);
  } catch {
    return null;
  }
}

/** The single weapon row id a synthesised sheet uses. Stable, so the chat card
 * of an attack can point back at it after a reload. */
export const STATIST_WEAPON_ROW_ID = 'statist-weapon';

/**
 * The profile seen as a character sheet.
 *
 * This is the whole trick of the module: instead of teaching the attack, damage
 * and grapple code what a statist is, the statist is handed to them wearing a
 * sheet. The result is a genuine `CpredCharacterData` — the planner validates
 * it, the breakdown names its stats, the wound state reads its HP — it simply
 * happens to have one weapon, no armour rows and no Luck to spend.
 *
 * `hp` comes from the caller because it lives on the token: passing it in keeps
 * the profile from holding a second copy of a number the map already owns.
 */
export function combatProfileSheet(
  profile: CpredCombatProfile,
  hp: { current: number; max: number },
): CpredCharacterData {
  const stats: CpredStats = {
    int: STATIST_DEFAULT_STAT,
    ref: profile.ref,
    dex: profile.dex,
    tech: STATIST_DEFAULT_STAT,
    cool: STATIST_DEFAULT_STAT,
    will: profile.will,
    // No Luck at all: a statist that could spend points would need somewhere to
    // spend them from, and „the GM's pool" is a rule this project does not have.
    luck: 0,
    move: STATIST_DEFAULT_STAT,
    body: profile.body,
    emp: STATIST_DEFAULT_STAT,
  };
  return {
    schemaVersion: CPRED_SCHEMA_VERSION,
    stats,
    // The token's bar is the truth. `hpMax(stats)` would compute a different
    // number from BODY and WILL, and the two would disagree on screen.
    hpCurrent: Math.max(0, Math.min(hp.max, hp.current)),
    luckCurrent: 0,
    // Full Humanity, not zero: EMP used in play is derived from it (stage 23a),
    // and a thug with no sheet is not a cyberpsycho — he simply has no chrome.
    humanityCurrent: humanityMax(stats),
    roleId: null,
    roleAbilityRank: 1,
    skills: { [CPRED_EVASION_SKILL_ID]: profile.evasion },
    weapons: [
      {
        id: STATIST_WEAPON_ROW_ID,
        name: profile.weaponName,
        notes: '',
        damage: profile.weaponDamage,
        ammoCurrent: profile.ammoCurrent,
        ammoMax: profile.ammoMax,
        ammoType: '',
        rof: '1',
        ...(profile.weaponId ? { compendiumId: profile.weaponId } : {}),
      },
    ],
    armor: [],
    gear: [],
    cyberware: [],
    criticalInjuries: [],
    deathSaves: 0,
    eddies: 0,
    // A statist has no wallet and pays no rent: the sheet is synthesised for
    // one fight and thrown away, and the monthly settlement skips a null.
    lifestyle: null,
    // Nobody has heard of him (stage 23c). „Większość Postaci w Cyberpunku RED
    // zaczyna grę z Reputacją 0", and a nameless ganger is the case that
    // sentence describes — he faces down at bare CHA 5.
    reputationSources: [],
    notes: '',
    // Trzy linijki prozy z wydruku (27b). Statysta nie ma ich czym wypełnić —
    // ta karta powstaje na jedną walkę i po niej znika.
    addictions: '',
    style: '',
    ammoStock: '',
    // Ani Ścieżki Życia (25b): statysta nie ma kultury pochodzenia, wrogów
    // ani celu życiowego — ma imię na żetonie i jedną broń.
    lifepath: createDefaultLifepath(),
  };
}

/**
 * The skill level this statist rolls the given skill at.
 *
 * One number covers every combat skill on purpose (see `skillLevel`), with one
 * exception that has its own field: Evasion, because a statist that dodges as
 * well as it shoots is a statist that never gets hit. „Unik" is the only skill
 * the rules ask a defender for, so it is the only one worth separating.
 */
export function combatProfileSkillLevel(profile: CpredCombatProfile, skillId: string): number {
  return skillId === CPRED_EVASION_SKILL_ID ? profile.evasion : profile.skillLevel;
}

/**
 * The sheet a statist rolls one particular skill with.
 *
 * `combatProfileSheet` gives every skill except Evasion a level of zero, which
 * is right for a sheet but wrong for a roll: the profile's single `skillLevel`
 * is what the weapon fires at. Handing the level in at roll time — rather than
 * filling the whole registry with it — keeps „this statist is trained in
 * everything" from becoming true anywhere else.
 */
export function combatProfileSheetForSkill(
  profile: CpredCombatProfile,
  hp: { current: number; max: number },
  skillId: string | null,
): CpredCharacterData {
  const sheet = combatProfileSheet(profile, hp);
  if (!skillId) return sheet;
  return {
    ...sheet,
    skills: { ...sheet.skills, [skillId]: combatProfileSkillLevel(profile, skillId) },
  };
}
