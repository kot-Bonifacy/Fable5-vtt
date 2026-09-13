/**
 * CP RED attacks (stage 16) — pure logic, no IO.
 *
 * The rulebook resolves an attack as one roll against a Difficulty Value:
 *
 *  - ranged: REF + weapon skill + 1d10 against a DV read off the range table
 *    for that weapon type and the measured distance (s. 173);
 *  - autofire: REF + „Ogień ciągły" + 1d10 against the *autofire* table, and
 *    the damage is 2d6 multiplied by how far the roll beat the DV, capped per
 *    weapon type (s. 173–174);
 *  - suppressive fire: the attacker's REF + „Ogień ciągły" + 1d10 becomes the
 *    DV every target has to beat with WILL + „Koncentracja" + 1d10 (s. 174);
 *  - melee: DEX + melee skill + 1d10 against the defender's DEX + „Unik" +
 *    1d10 (s. 176).
 *
 * Ties always go to the defender, so a hit needs a total strictly above the DV
 * („W przypadku remisu Broniący zawsze wygrywa", s. 169).
 *
 * Melee — and a ranged attack the defender chooses to dodge — is an opposed
 * roll in the rules, which would mean waiting for a second player before the
 * attack can resolve. Instead the plan carries a *stand-in* DV built from the
 * defender's sheet (DEX + Evasion + `CPRED_PASSIVE_DIE`), and the defender may
 * replace it with a real roll from the chat card afterwards. The maths of the
 * stand-in matches the opposed roll closely: swapping a d10 for its average
 * shifts the odds by a couple of percent, not by a category.
 */

import {
  parseRollNotation,
  type RollBreakdownEntry,
  type RollFormula,
  type RollTerm,
} from '../../dice.js';
import { ammoFitsWeapon, type CpredAmmoCheck, type CpredAmmoProfile } from './ammo.js';
import { CPRED_BLAST_SIDE_M, CPRED_THROW_RANGE_M } from './areas.js';
import {
  cpredArmorStatPenalty,
  cpredDrawFits,
  cpredDrawnWeapons,
  cpredWeaponInHands,
  CPRED_ARMOR_PENALTY_LABEL,
  CPRED_HANDS,
  type CpredCharacterData,
  type CpredRegistry,
  type CpredWeaponRow,
} from './character.js';
import {
  CPRED_RANGE_BANDS,
  dvForRange,
  rangeBandLabel,
  type AutofireProfile,
  type RangeDvTable,
  type ResolvedWeapon,
} from './compendium.js';
import { CPRED_OBSCUREMENT_KIND } from './environment.js';
import {
  attachmentAttackModifiers,
  attachmentIgnoresObscurement,
  hasRequiredCyberware,
  type CpredAttachmentProfile,
} from './attachments.js';
import { hasCyberarm } from './cyberware.js';
import { CPRED_AIMED_SHOT_PENALTY } from './damage.js';
import { cpredSheetCombatAwareness } from './roleability.js';
import {
  CPRED_AIM_POINT_LABELS,
  hitLocationForAim,
  type CpredAimPoint,
  type CpredHitLocation,
} from './locations.js';
import {
  CPRED_SITUATIONAL_MODIFIER_LIMIT,
  cpredSheetWoundCondition,
  cpredWoundPenaltyRows,
  type CpredWoundState,
} from './rolls.js';
import { CPRED_STAT_LABELS, type CpredStatId } from './stats.js';
import { cpredEffectiveStats, cpredStatEffectRows } from './stateffects.js';

/** How the attack is being made. Melee follows from the weapon, not from here. */
export const CPRED_ATTACK_MODES = ['single', 'autofire', 'suppressive'] as const;
export type CpredAttackMode = (typeof CPRED_ATTACK_MODES)[number];

export const CPRED_ATTACK_MODE_LABELS: Record<CpredAttackMode, string> = {
  single: 'Pojedynczy strzał',
  autofire: 'Ogień ciągły',
  suppressive: 'Ogień zaporowy',
};

/**
 * One-word names for places with no room for the full ones — a chip on an
 * action-bar slot, the hint over the map. Null for a plain shot, which needs no
 * word at all: „Ciężki pistolet" already says everything.
 */
export const CPRED_ATTACK_MODE_SHORT: Record<CpredAttackMode, string | null> = {
  single: null,
  autofire: 'seria',
  suppressive: 'zapora',
};

/** Reach of a melee attack — „Atakowany cel musi znajdować się do 2 m od ciebie". */
export const CPRED_MELEE_REACH_M = 2;

/**
 * „Gdy atakujesz za pomocą broni doskonałej jakości, dodajesz +1 do Testów
 * ataku" (s. 244) — the whole of what quality is worth on the way in.
 */
export const CPRED_EXCELLENT_ATTACK_BONUS = 1;

/** How the card names the bonus, and the jam that is its opposite number. */
export const CPRED_EXCELLENT_LABEL = 'Broń doskonałej jakości';

/**
 * One sentence for „this gun is jammed", spoken by three mouths: the planner's
 * refusal, the greyed-out slot on the action bar and the chip on the sheet's
 * weapon row. Spelled once so the table hears the same thing wherever it looks.
 */
export const CPRED_JAM_REFUSAL = 'Broń się zacięła — usuń usterkę (Akcja).';

/**
 * To samo dla „tego nie masz w rękach" (etap 41), i z tego samego powodu: zdanie
 * pada w odmowie planera i na wyszarzonym slocie paska.
 *
 * Zdania są **dwa**, bo są dwie sytuacje (13.09). Broń, która mieści się
 * w wolnych rękach, wystarczy dobyć — za darmo (s. 168). Dopiero przy zajętych
 * rękach trzeba najpierw coś odłożyć, a obie drogi różnią się ceną: schowanie
 * kosztuje Akcję, upuszczenie nic. Do 13.09 zdanie było jedno, więc postać
 * z pustymi rękami słyszała „schowaj tamto (Akcja)" o broni, której nie trzyma.
 * Która sytuacja zachodzi, rozstrzyga `cpredDrawFits`.
 */
export const CPRED_NOT_DRAWN_REFUSAL =
  'Masz w rękach co innego — schowaj tamto (Akcja) albo upuść, a potem dobądź tę broń.';
export const CPRED_HOLSTERED_REFUSAL = 'Broń jest w kaburze — dobądź ją (bez Akcji).';

/** A burst and a suppressive volley each cost an Action and ten rounds. */
export const CPRED_BURST_AMMO_COST = 10;

/** Everyone visible within this radius has to make the WILL check. */
export const CPRED_SUPPRESSIVE_RANGE_M = 25;

/** Damage of a burst before the multiplier (RAW: always 2d6). */
export const CPRED_AUTOFIRE_DAMAGE = '2k6';

/** Skill ids the combat rules name directly. */
export const CPRED_AUTOFIRE_SKILL_ID = 'autofire';
export const CPRED_EVASION_SKILL_ID = 'evasion';
export const CPRED_CONCENTRATION_SKILL_ID = 'concentration';
/** „testując ZW + Atletyka + 1k10" — everything thrown by hand (s. 177). */
export const CPRED_THROW_SKILL_ID = 'athletics';

/**
 * REF a target needs before it may jump clear of a blast or a shotgun spread:
 * „Osoba z REF 8 lub wyższym może zdecydować się na odskoczenie poza obszar
 * wybuchu" (s. 174).
 */
export const CPRED_EVADE_AREA_MIN_REF = 8;

/**
 * DV of an unopposed swing at a target with no sheet to dodge with. 13 is the
 * rulebook's „Codzienny" rung of the difficulty ladder (s. 168) — the ordinary
 * difficulty, which is what hitting an ordinary statist is.
 */
export const CPRED_EVERYDAY_DV = 13;

/**
 * The die a stand-in DV substitutes for the defender's 1d10. Half of ten: an
 * average roll, rounded the way the rest of the rules round (down).
 */
export const CPRED_PASSIVE_DIE = 5;

/** Aimed shots are single shots only (RAW: „Strzelając ogniem ciągłym, nie można Celować"). */
export function canAimInMode(mode: CpredAttackMode): boolean {
  return mode === 'single';
}

/**
 * Brawling and martial arts damage, from the attacker's BODY (s. 176). A
 * cyberarm lifts a weak attacker to the 2d6 rung, which the caller passes in
 * as `cyberarm` because cyberware only arrives in stage 23.
 */
export function unarmedDamage(body: number, cyberarm = false): string {
  if (body >= 11) return '4k6';
  if (body >= 7) return '3k6';
  if (body >= 5 || cyberarm) return '2k6';
  return '1k6';
}

/** The range band a distance falls into, or null when it is off the table. */
export function rangeBandFor(metres: number): (typeof CPRED_RANGE_BANDS)[number] | null {
  return CPRED_RANGE_BANDS.find((band) => metres >= band.min && metres <= band.max) ?? null;
}

/** DV of a burst at this distance; null when the autofire table does not reach. */
export function autofireDvForRange(
  profile: AutofireProfile | undefined,
  metres: number,
): number | null {
  if (!profile) return null;
  return dvForRange(profile.rangeDv, metres);
}

/**
 * The burst's damage multiplier: how far the roll beat the DV, never more than
 * the weapon's cap and never less than one (a hit always does its 2d6).
 */
export function autofireMultiplier(margin: number, max: number): number {
  return Math.max(1, Math.min(Math.round(margin), Math.round(max)));
}

/** Stand-in DV of a defender who has a sheet: DEX + Evasion + half a die. */
export function passiveEvasionDv(data: CpredCharacterData, registry: CpredRegistry): number {
  return evasionBase(data, registry) + CPRED_PASSIVE_DIE;
}

/**
 * DEX + Evasion — the defender's side of the opposed roll, without the die.
 *
 * Minus what the armour costs (s. 185): the modifier reaches ZW, and dodging is
 * the Check ZW is most often asked for. Folded into the number rather than
 * shown as a row, because this side of the roll has no breakdown to show it in
 * — the attacker's card prints a DV, not the defender's arithmetic.
 */
export function evasionBase(data: CpredCharacterData, registry: CpredRegistry): number {
  const skill = registry.skills.find((entry) => entry.id === CPRED_EVASION_SKILL_ID);
  const statId = skill ? skill.stat : 'dex';
  // Etap 39: ZW **jak teraz**. Ta strona rzutu nie ma rozbicia, w którym dałoby
  // się pokazać Lisz osobnym wierszem — atakujący widzi PT, nie arytmetykę
  // obrońcy — więc efekt wchodzi w liczbę, tak samo jak kara z pancerza wyżej.
  const stat = cpredEffectiveStats(data)[statId];
  return (
    stat +
    cpredArmorStatPenalty(data.armor, statId, stat) +
    (data.skills[CPRED_EVASION_SKILL_ID] ?? 0)
  );
}

/** What the client asks the server to resolve. Distance is never sent — it is measured. */
export interface CpredAttackRequest {
  /** Weapon row on the attacker's sheet. */
  weaponRowId: string;
  mode: CpredAttackMode;
  /** Skill to roll with, when the weapon row carries no compendium type. */
  skillId?: string;
  /**
   * Aimed Shot (s. 170): −8 to hit, one attack, the whole Action. Absent means
   * an ordinary attack, which „zawsze trafia w ciało".
   */
  aimedAt?: CpredAimPoint;
  modifier?: number;
  luckSpent?: number;
  /**
   * Fire anyway, with a cover standing in the way (stage 16c).
   *
   * The rules do not have this button — cover either stops the round or it is
   * not cover (s. 179) — so it is deliberately an explicit, per-shot decision
   * rather than a setting: the card names the car, and somebody at the table
   * says „he leaned out". Without the flag the planner refuses, which is what
   * keeps „I forgot the car was there" from ever happening silently.
   */
  ignoreCover?: boolean;
  /**
   * Fire the weapon bolted onto this row instead of the row itself (stage 31).
   *
   * A bayonet, an underbarrel launcher and an underbarrel shotgun are one
   * object with two ways to hurt somebody — „Trzymaną oburącz broń można
   * wykorzystać jako Granatnik z tylko jednym granatem w magazynku" (s. 343) —
   * so the choice is a field on the attack rather than a second weapon row. The
   * caller resolves which weapon that is; the planner is handed it, exactly as
   * it is handed the Grenade Launcher line for a throw.
   */
  attachmentId?: string;
  /**
   * Throw this row rather than use it normally (stage 16d) — „Rzut przedmiotem".
   *
   * Redundant for a grenade, whose weapon *type* is thrown by definition; it
   * exists for the knife, the brick and the chair, which are ordinary rows until
   * somebody decides to let go of one. The DV then comes off the Grenade
   * Launcher line whatever the object is (s. 177), which is why the caller has
   * to supply `throwProfile` — that line lives in the compendium.
   */
  thrown?: boolean;
}

/** The target's side, as the server measured and read it. */
export interface CpredAttackTarget {
  name: string;
  /** Whole metres between the two tokens (see `metresForRules`). */
  metres: number;
  /**
   * Stand-in DV from the defender's sheet. Absent for a statist token, which
   * falls back to the everyday DV.
   */
  evasionDv?: number;
  /**
   * This target is a cover, not a person (stage 16c).
   *
   * An object does not dodge, does not wear armour and cannot be shot in the
   * head, so the three things that follow from being a person are switched off
   * — but everything else (the range table, the ammunition, the turn budget)
   * is the ordinary attack, which is the reason cover is a *target* here rather
   * than a second event.
   */
  cover?: boolean;
  /**
   * This target is a patch of ground, not a person (stage 16d).
   *
   * „twój cel (pole 2x2 metry, nie osoba) jest środkiem tego obszaru" (s. 174):
   * a grenade is aimed at a square, and the square neither dodges nor has a head,
   * so it switches the same three things off as a cover does. What it keeps is
   * the range table — a badly thrown grenade is badly thrown at a distance.
   */
  point?: boolean;
}

export type CpredAttackProblem =
  | 'BAD_REQUEST'
  | 'BAD_MODIFIER'
  | 'NOT_ENOUGH_LUCK'
  | 'UNKNOWN_WEAPON'
  | 'UNKNOWN_SKILL'
  | 'BAD_DAMAGE'
  | 'NO_AUTOFIRE'
  | 'NO_SUPPRESSIVE'
  | 'OUT_OF_RANGE'
  | 'MELEE_OUT_OF_REACH'
  | 'MELEE_BLOCKED'
  | 'RANGED_WEAPON_IN_MELEE'
  | 'NOT_ENOUGH_AMMO'
  | 'GRAPPLE_TWO_HANDED'
  | 'NO_LINE_OF_FIRE'
  | 'TARGET_BEHIND_COVER'
  | 'COVER_NOT_SUPPRESSIBLE'
  | 'AMMO_MISMATCH'
  | 'AMMO_SINGLE_ONLY'
  | 'AMMO_NEEDS_CYBERWARE'
  | 'UNKNOWN_ATTACHMENT'
  | 'WEAPON_JAMMED'
  | 'WEAPON_NOT_DRAWN'
  | 'WEAPON_HOLSTERED';

/** Everything the chat card needs to explain a hit — and to offer the damage roll. */
export interface CpredAttackMeta {
  mode: CpredAttackMode;
  modeLabel: string;
  weaponRowId: string;
  weaponName: string;
  melee: boolean;
  /** Damage notation rolled on a hit; a burst always rolls 2k6. */
  damage: string;
  /** Which armor the hit has to get through, and whether the ×2 applies. */
  location: CpredHitLocation;
  /**
   * True when this was an Aimed Shot — the −8 was paid and the Action is spent.
   * Kept beside `aimedAt` because the turn budget only asks the yes/no half.
   */
  aimed: boolean;
  /**
   * What was aimed at, when it was an Aimed Shot. A leg and a held item both
   * resolve against `location: 'body'`, and their consequences land when the
   * damage is applied — so the card has to carry which one it was.
   */
  aimedAt?: CpredAimPoint;
  targetName: string;
  /**
   * Target token, so „Obrażenia" can pre-select it in stage 15's controls.
   * Absent when the shot is aimed at a cover (stage 16c).
   */
  targetTokenId?: string;
  /**
   * The figure that fired, so the damage roll can find a shooter who has no
   * sheet (stage 16b). A character is found by its weapon row; a statist has
   * nothing to be found by, and „Obrażenia" was missing from its card for as
   * long as this field was.
   *
   * Server-filled, like every other address on this card: the token is read off
   * the attack that actually happened, never off the client's word for it.
   */
  attackerTokenId?: string;
  /** Cover being shot at instead of a token (stage 16c). */
  targetCoverId?: number;
  metres: number;
  /** „13–25 m", or null for melee and suppressive fire. */
  rangeLabel: string | null;
  /**
   * DV the roll is measured against; null for suppressive fire, whose DV is
   * the attacker's own total.
   */
  dv: number | null;
  dvSource: 'range' | 'autofire' | 'evasion' | 'everyday' | 'suppressive' | 'spread';
  /** Cap of the burst multiplier, present for `mode: 'autofire'`. */
  autofireMax?: number;
  /** Thrown by hand rather than fired (stage 16d). */
  thrown?: boolean;
  /**
   * Only half the defender's armour stops this hit, rounded up (s. 176, 178).
   *
   * Decided here rather than where the damage lands, for the reason `ammo` is:
   * the card is applied long after the swing, and „was this a blade?" has to be
   * the answer for the attack that happened. A thrown blade is not one — „przy
   * takim ataku rozpatruje się pełną OB pancerza" (s. 177).
   */
  halvesArmor?: boolean;
  /**
   * SP of the barriers this shot passed through on its way to the target (stage
   * 42b) — taken off the damage before the target's armour.
   *
   * Measured by the server at the moment of the shot and carried by the card, for
   * the reason `halvesArmor` is: „Zastosuj" comes long after, and by then the
   * target may have walked round the fence. Absent for a swing (it cannot reach
   * through a barrier at all) and for an area, whose every target has its own
   * line and its own number (`RollAreaTarget.barrierArmor`).
   */
  barrierSp?: number;
  /**
   * A natural 1 on this Test costs nothing (stage 30a) — the Solo has 4 points
   * in „Wyjście z opresji" (s. 146). Read straight off the sheet by the
   * planner, and read again by whoever rolls: the flag has to be decided before
   * the die falls, unlike everything else on this card.
   */
  ignoresFumble?: true;
  /**
   * Damage „Wykrycie słabości" adds before armour, when this hit earned it
   * (stage 30a, s. 146).
   *
   * The planner puts the Solo's whole allocation here; the **server** clears it
   * unless this is the first successful Attack of the Round, because „pierwszym
   * udanym Atakiem w Rundzie" is state of the fight and the sheet cannot know
   * it. A client's word for it is never taken — same rail as `halvesArmor`.
   */
  weakSpot?: number;
  /**
   * The round in the magazine (stage 16g), carried whole rather than by id.
   *
   * The chat card is read long after the shot, „Zastosuj" runs on a different
   * event, and the catalogue may have been edited in between — so the effects
   * that decide the hit travel *with* the hit, exactly as the Critical Injury's
   * machine flags travel with the wound (14e).
   */
  ammo?: CpredAmmoProfile;
  /**
   * Reach of the shotgun's cone in metres, when this shot spreads (s. 174).
   * Present only for spread ammunition; the server measures who stands in it.
   */
  coneRangeM?: number;
  /**
   * Stat the roll was made with. Carried because the scatter of a missed charge
   * is measured against it (stage 16d) and reading it back off the breakdown's
   * label would mean parsing „Zręczność (ZW)" at the other end.
   */
  statId: CpredStatId;
  /**
   * This attack goes off over an area (stage 16d). The side is carried rather
   * than assumed so a card written today still reads right if the catalogue
   * ever grows a bigger charge.
   */
  blastSideM?: number;
  /**
   * The attachment this shot was fired *with* (stage 31) — the bayonet, the
   * underbarrel launcher, the underbarrel shotgun.
   *
   * Carried whole rather than by id for the reason `ammo` is: the card is read
   * long after the swing, and „which weapon was this" has to keep answering
   * after somebody edits the catalogue.
   */
  attachmentId?: string;
  attachmentName?: string;
  /** Rounds this attack spends. */
  ammoCost: number;
  ammoBefore: number;
  ammoAfter: number;
  /**
   * How much the magazine holds. Carried because the card's „magazynek 29/40"
   * promises capacity, and capacity cannot be reconstructed from the rounds
   * spent: `ammoCost + ammoAfter` is only the same number while the weapon
   * started full. Optional, so cards written before this field still render.
   */
  ammoMax?: number;
}

/** A planned attack: the roll to make, plus everything needed to judge it. */
export interface CpredAttackPlan {
  title: string;
  formula: RollFormula;
  breakdown: RollBreakdownEntry[];
  modifierTotal: number;
  woundState: CpredWoundState;
  luckSpent: number;
  attack: CpredAttackMeta;
}

/**
 * What the attacker's situation adds to the roll, and what it forbids
 * (stage 14d). Both halves come from combat state the server owns.
 */
export interface CpredAttackContext {
  /** Named entries spliced into the breakdown, e.g. „Trzymanie −2". */
  modifiers?: readonly RollBreakdownEntry[];
  /**
   * The attacker is in a Hold: „Żadna z Trzymających się Postaci nie może
   * wykorzystywać broni dwuręcznych, nawet jeśli te Postacie mają więcej niż
   * dwie ręce" (s. 176).
   */
  grappled?: boolean;
  /**
   * Is the straight line to the target free of walls, shut doors and — from
   * stage 16c — cover (stage 16b)?
   *
   * Measured by the server, which is the only side that holds the geometry: the
   * walls never reach a client (18a), so a preview on the sheet cannot know and
   * deliberately leaves this `undefined`, which means „do not judge it here".
   * Only an explicit `false` refuses the attack.
   */
  lineOfFire?: boolean;
  /**
   * Something that stops a body stands between the two figures (stage 42a) — a
   * barrier, a shut gate, a closed window. Filled in by the server alone, like
   * `lineOfFire`, and read only for a swing: a fence stops an arm, not a bullet.
   */
  reachBlocked?: boolean;
  /**
   * SP of the barriers on the line to the target (stage 42b). Filled in by the
   * server alone, like `lineOfFire` — the walls never reach a client. The planner
   * refuses nothing because of it; it only puts the number on the card of a shot
   * that has one target.
   */
  barrierSp?: number;
  /**
   * A cover standing between the shooter and the target (stage 16c).
   *
   * Unlike `lineOfFire` this one is filled in on **both** sides, and that is
   * the difference between a wall and a car: covers travel to the client, so a
   * preview can see the obstacle coming and offer the choice before the dice
   * are picked up rather than after the refusal.
   *
   * `request.ignoreCover` is the one thing that gets past it.
   */
  cover?: { name: string; hpCurrent: number; hpMax: number };
  /**
   * The Grenade Launcher line of the range table, for anything thrown that is
   * not itself a grenade (stage 16d).
   *
   * Passed in rather than looked up because the rules put it in the catalogue —
   * „PT określasz, używając wiersza Granatnika w tabeli PT zasięgów" (s. 177) —
   * and the planner is not allowed to know the catalogue. Both sides fill it
   * from the same compendium, so the preview and the verdict agree.
   */
  throwProfile?: { rangeDv: RangeDvTable; skillId?: string };
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** Weapon types whose damage comes from the attacker's body, not the weapon. */
const UNARMED_TYPE_IDS = new Set(['weapon-type.brawling', 'weapon-type.martial-arts']);

/**
 * Damage notation for one hit: the row's own damage, except for bare hands,
 * whose damage the rules read off the attacker's BODY — and, for the weakest
 * rung, off their chrome („BC 4 lub mniej z cyberręką — 2k6", s. 176).
 */
export function attackDamageNotation(
  row: Pick<CpredWeaponRow, 'damage'>,
  stats: Pick<CpredCharacterData['stats'], 'body'>,
  weaponTypeId?: string | null,
  cyberarm = false,
): string {
  if (weaponTypeId && UNARMED_TYPE_IDS.has(weaponTypeId)) {
    return unarmedDamage(stats.body, cyberarm);
  }
  return row.damage;
}

/**
 * The sheet row a bolted-on weapon fires from (stage 31).
 *
 * Synthetic rather than stored, because there is nothing on paper to store: the
 * bayonet is not a second line of the equipment list, it is the rifle with a
 * knife on the end. What it borrows from the host is the row id — every address
 * downstream (the turn budget, the damage card, the reload) points at the row
 * somebody actually owns — and what it replaces is everything the rules read:
 * the name that goes on the card, the damage, and the magazine that must not be
 * the rifle's, or firing one grenade would cost twenty-five rifle rounds.
 */
function secondaryWeaponRow(
  host: CpredWeaponRow,
  attachment: CpredAttachmentProfile,
  resolved: ResolvedWeapon,
): CpredWeaponRow {
  const magazine = resolved.magazine ?? 0;
  const loaded = host.attachmentAmmo?.[attachment.id];
  return {
    ...host,
    name: attachment.name,
    damage: resolved.damage,
    // A weapon that counts no rounds (the bayonet) keeps a zero magazine, which
    // `attackAmmoCost` already reads as „this one does not track ammunition".
    ammoMax: magazine,
    ammoCurrent: magazine > 0 ? Math.min(loaded ?? magazine, magazine) : 0,
    ammoType: resolved.ammoType ?? '',
    // The round in the host's magazine belongs to the host; this weapon has one
    // of its own (02.09), and until it did, a launcher under the barrel could
    // only ever fire ordinary rounds — no smoke, no gas, no matter what the
    // catalogue offered.
    ammoId: host.attachmentAmmoId?.[attachment.id],
  };
}

/**
 * Validates an attack against the attacker's sheet, the weapon's catalogue
 * entry and the measured distance, then builds the roll and its breakdown.
 * Runs unchanged on the client (preview) and the server (authoritative).
 */
export function planCpredAttack(
  data: CpredCharacterData,
  registry: CpredRegistry,
  request: CpredAttackRequest,
  weapon: {
    row: CpredWeaponRow;
    resolved: ResolvedWeapon | null;
    /** Type id of the row's compendium entry, when it has one. */
    typeId?: string | null;
    /**
     * The round in the magazine (stage 16g), already looked up in the catalogue
     * by the caller — the planner is not allowed to go shopping, for the same
     * reason it is handed the Grenade Launcher line rather than finding it.
     */
    ammo?: CpredAmmoProfile | null;
    /**
     * Attachments bolted to this row, resolved from the catalogue (stage 31).
     * The planner reads what they change; it never goes looking for them.
     */
    attachments?: readonly CpredAttachmentProfile[];
    /**
     * The weapon `request.attachmentId` names, resolved by the caller — the
     * launcher's own range table, the bayonet's own damage. Required whenever
     * the request names an attachment, and refused when it is missing: a shot
     * with a weapon nobody resolved is a shot with no rules.
     */
    secondary?: ResolvedWeapon | null;
    /**
     * The round loaded in that bolted-on weapon (02.09), looked up by the caller
     * for the same reason `ammo` is. Absent means the launcher is holding
     * ordinary ammunition — which is what *every* underbarrel held until this
     * field existed, and the reason smoke and gas could not be fired from one.
     */
    secondaryAmmo?: CpredAmmoProfile | null;
    /**
     * Ile rąk zajmuje to, co strzelec już trzyma (13.09) — policzone przez
     * wołającego z katalogu, jak `resolved`. Rozstrzyga wyłącznie o **zdaniu**
     * odmowy broni spoza rąk: „dobądź ją" czy „najpierw schowaj tamto". Brak pola
     * przy czymkolwiek w rękach znaczy „nie wiadomo" i daje to drugie — zdanie
     * ostrożniejsze, bo nie obiecuje dobycia, którego serwer mógłby odmówić.
     */
    handsHeld?: number;
  },
  target: CpredAttackTarget & { tokenId?: string; coverId?: number },
  /**
   * Modifiers the world imposes — being Held is −2 (stage 14d). Server-filled:
   * a client must not be able to declare its own (`CpredRollContext`).
   */
  context: CpredAttackContext = {},
): { ok: true; plan: CpredAttackPlan } | { ok: false; error: CpredAttackProblem } {
  if (typeof request !== 'object' || request === null) return { ok: false, error: 'BAD_REQUEST' };
  const mode: CpredAttackMode = (CPRED_ATTACK_MODES as readonly string[]).includes(request.mode)
    ? request.mode
    : 'single';

  const modifier = request.modifier ?? 0;
  if (!isInteger(modifier) || Math.abs(modifier) > CPRED_SITUATIONAL_MODIFIER_LIMIT) {
    return { ok: false, error: 'BAD_MODIFIER' };
  }
  const luckSpent = request.luckSpent ?? 0;
  if (!isInteger(luckSpent) || luckSpent < 0) return { ok: false, error: 'BAD_REQUEST' };
  if (luckSpent > data.luckCurrent) return { ok: false, error: 'NOT_ENOUGH_LUCK' };
  if (!isInteger(target.metres) || target.metres < 0) return { ok: false, error: 'BAD_REQUEST' };

  // Stage 31: the gun, or what somebody bolted onto it. Three of the eight
  // printed attachments turn one object into two — „Trzymaną oburącz broń można
  // wykorzystać jako Granatnik" (s. 343) — and from this line down the planner
  // simply works on whichever weapon is being fired. Every rule below (range
  // table, reach, fire modes, half armour, magazine) then applies to the
  // underbarrel because it applies to weapons, not because anybody wrote a
  // branch for underbarrels.
  const hostRow = weapon.row;
  const attachments = weapon.attachments ?? [];
  const firedWith =
    typeof request.attachmentId === 'string'
      ? attachments.find(
          (entry) => entry.id === request.attachmentId && entry.secondary !== undefined,
        )
      : undefined;
  if (request.attachmentId !== undefined && (!firedWith || !weapon.secondary)) {
    return { ok: false, error: 'UNKNOWN_ATTACHMENT' };
  }
  const secondary = firedWith ? (weapon.secondary as ResolvedWeapon) : null;
  const resolved = secondary ?? weapon.resolved;
  const row = firedWith && secondary ? secondaryWeaponRow(hostRow, firedWith, secondary) : hostRow;
  const weaponTypeId = firedWith ? firedWith.secondary!.weaponTypeId : weapon.typeId;

  // Letting go of something turns it into a ranged attack whatever it is
  // (s. 177), so a thrown knife stops being a melee weapon for this one roll.
  const thrown = resolved?.thrown === true || request.thrown === true;
  const melee = thrown ? false : (resolved?.melee ?? false);
  const explosive = resolved?.explosive === true;
  // „Rzucone bronie białe … rozpatruje się pełną OB pancerza, a nie połowę"
  // (s. 177): letting go of a machete costs it the half it would have ignored.
  const halvesArmor = !thrown && resolved?.halvesArmor === true;
  // The round in the magazine (stage 16g) and the one thing it can change about
  // the shape of the attack: a shell sprays a cone instead of hitting one person.
  //
  // A bolted-on weapon fires its own round: the armour-piercing one in the rifle
  // is not in the launcher under it, and pretending it were would hand the
  // grenade the rifle's flags. Its own magazine therefore has its own load
  // (02.09) — without which a launcher could only ever fire ordinary rounds, and
  // „Amunicja dymna" had nothing to come out of.
  const ammo = firedWith ? (weapon.secondaryAmmo ?? null) : (weapon.ammo ?? null);
  const spread = ammo?.spread;
  // What the range table is read from, and how far the arm reaches at all. A
  // spread of shot has neither table nor arm — it simply stops at the cone's
  // reach („do 6 m przed tobą", s. 174), which is its range limit whole.
  const rangeDv = thrown ? (resolved?.rangeDv ?? context.throwProfile?.rangeDv) : resolved?.rangeDv;
  const maxRangeM = spread
    ? spread.coneRangeM
    : thrown
      ? (resolved?.maxRangeM ?? CPRED_THROW_RANGE_M)
      : resolved?.maxRangeM;

  // „Dopóki w ramach Akcji nie usuniesz usterki, broń nie nadaje się do użytku"
  // (s. 244). Checked on the host row and only for a shot with the host weapon:
  // a jammed rifle is a jammed rifle, but the grenade launcher bolted under it
  // has its own mechanism and no quality of its own to fail — nothing in the
  // rules ties the two, and refusing the launcher would take away the one thing
  // still worth doing with the gun.
  if (hostRow.jammed === true && !firedWith) return { ok: false, error: 'WEAPON_JAMMED' };

  /*
   * Etap 41: strzelać można tym, co się ma w rękach.
   *
   * Sprawdzane na wierszu **nosiciela**, tak samo jak zacięcie: bagnet
   * i granatnik podwieszany są częścią broni, którą figura trzyma, więc trzymanie
   * karabinu jest trzymaniem obu.
   *
   * Odmowa obowiązuje **wyłącznie figury z zadeklarowanymi rękami** — decyzja MG
   * z 10.09.2026. Karta, przy której nikt nigdy nie dobył ani nie schował broni,
   * nie ma zadeklarowanych rąk, a to, co pokazują jej oględziny („pierwsza broń
   * z karty"), jest domysłem VTT na użytek obrazu. Domysł nie zabrania: zakaz
   * z niego wyprowadzony byłby regułą, której nie ustalił nikt przy stole.
   *
   * Od pierwszego dobycia albo schowania odmowa jest pełna i mówi, co zrobić:
   * dobyć tę broń, gdy mieści się w wolnych rękach (za darmo, s. 168), a inaczej
   * najpierw schować tamtą (Akcja) albo ją upuścić (za darmo).
   */
  if (!cpredWeaponInHands(data, hostRow.id)) {
    const handsHeld = weapon.handsHeld ?? (cpredDrawnWeapons(data).length === 0 ? 0 : CPRED_HANDS);
    return {
      ok: false,
      error: cpredDrawFits(handsHeld, weapon.resolved?.hands ?? 1)
        ? 'WEAPON_HOLSTERED'
        : 'WEAPON_NOT_DRAWN',
    };
  }

  // A hand is busy holding somebody: two-handed weapons are out for both sides
  // of a Hold, whatever the sheet says about extra arms (s. 176).
  if (context.grappled === true && resolved?.hands === 2) {
    return { ok: false, error: 'GRAPPLE_TWO_HANDED' };
  }

  // What is *in* the gun outranks what is in front of it: „naboje … należy
  // dopasować do rodzaju używanej broni" (s. 344), and a round that does not fit
  // never leaves the barrel, wall or no wall.
  if (ammo && !ammoFitsWeapon(ammo, resolved)) return { ok: false, error: 'AMMO_MISMATCH' };

  // „Jeśli próbuje jej użyć osoba bez tej cyborgizacji, z powodów bezpieczeństwa
  // amunicja inteligentna nie wystrzeli po pociągnięciu za spust" (s. 347).
  //
  // A refusal from stage 31 and prose before it — not because the rule changed,
  // but because until 23a the sheet had no chrome to check and refusing would
  // have been guessing. `smart.requires` is the round's own sentence about what
  // it needs, so a GM's own round with the same field is enforced the same way.
  const installedCyberware = data.cyberware.map((piece) => piece.name);
  if (ammo?.smart?.requires && !hasRequiredCyberware([ammo.smart.requires], installedCyberware)) {
    return { ok: false, error: 'AMMO_NEEDS_CYBERWARE' };
  }

  // What stands in the way outranks how far away it is (stage 16b): a target
  // behind a wall is not „out of range", and telling the player it is would send
  // them stepping back rather than round the corner. Melee is included on
  // purpose — a fist does not pass through a door either.
  //
  // Suppressive fire is exempt: it sprays an area rather than a token, and each
  // of its targets is tested on its own by the caller. Refusing the whole volley
  // because the token that set its direction happens to be behind a wall would
  // be the wrong answer to the wrong question.
  if (context.lineOfFire === false && mode !== 'suppressive') {
    return { ok: false, error: 'NO_LINE_OF_FIRE' };
  }
  // A fence is not a wall (stage 42a): the eye and the round go through it, an
  // arm does not. After the line of fire, so masonry keeps its own refusal, and
  // before the reach, for the reason the wall comes first. `melee` is already
  // false for a thrown blade — letting go of it makes it ranged (s. 177).
  if (melee && context.reachBlocked === true) {
    return { ok: false, error: 'MELEE_BLOCKED' };
  }

  // A cover in the way (stage 16c). Refused rather than penalised, because RAW
  // has no middle setting: „Nie ma czegoś takiego jak »częściowa« osłona"
  // (s. 179). The refusal is the card that offers the car as a target instead —
  // and `ignoreCover` is the table overruling it in one click.
  //
  // An explosive is exempt, and that exemption is the whole tactical point of a
  // grenade: it goes *over* the bonnet. The car still matters — it takes whoever
  // is behind it out of the blast (s. 174) — but that is decided where the charge
  // goes off, not on the way there.
  if (context.cover && request.ignoreCover !== true && mode !== 'suppressive' && !explosive) {
    return { ok: false, error: 'TARGET_BEHIND_COVER' };
  }
  // Suppressive fire sprays an area rather than an object, and an object cannot
  // be made to keep its head down.
  if (target.cover === true && mode === 'suppressive') {
    return { ok: false, error: 'COVER_NOT_SUPPRESSIBLE' };
  }

  // Reach and range: the map decides whether this attack is possible at all.
  if (melee && target.metres > CPRED_MELEE_REACH_M) {
    return { ok: false, error: 'MELEE_OUT_OF_REACH' };
  }
  if (!melee && mode !== 'suppressive' && !rangeDv) {
    // A ranged weapon with no range table is a hand-typed row; without the
    // table there is no DV to shoot against. For a throw it means the caller
    // did not hand over the Grenade Launcher line.
    return { ok: false, error: 'UNKNOWN_WEAPON' };
  }
  // „Maksymalny zasięg rzutu to 25 m" (s. 177) — a ceiling the DV table does not
  // express, because the table is the launcher's and a launcher outreaches an arm.
  if (maxRangeM !== undefined && mode !== 'suppressive' && target.metres > maxRangeM) {
    return { ok: false, error: 'OUT_OF_RANGE' };
  }
  if (melee && mode !== 'single') return { ok: false, error: 'BAD_REQUEST' };

  // Fire modes are a property of the weapon type, and both cost ten rounds.
  if (mode === 'autofire' && !resolved?.autofire) return { ok: false, error: 'NO_AUTOFIRE' };
  if (mode === 'suppressive' && resolved?.suppressive !== true) {
    return { ok: false, error: 'NO_SUPPRESSIVE' };
  }
  // Nothing let go of has a fire mode. Checked *after* the two above so that a
  // grenade asked for a burst hears „ta broń nie ma ognia ciągłego" rather than
  // a bare „nieprawidłowe żądanie" — the weapon is the reason, not the request.
  if (thrown && mode !== 'single') return { ok: false, error: 'BAD_REQUEST' };
  // „Gdy strzelasz amunicją śrutową, wykonujesz 1 atak dystansowy" (s. 174) —
  // one attack, one cone. A burst of shot has no rule and no DV table.
  if (spread && mode !== 'single') return { ok: false, error: 'AMMO_SINGLE_ONLY' };

  const ammoCost = attackAmmoCost(mode, row);
  if (ammoCost > 0 && row.ammoCurrent < ammoCost) return { ok: false, error: 'NOT_ENOUGH_AMMO' };

  // Which skill fires this attack: bursts always use „Ogień ciągły", anything
  // else uses the weapon type's skill (the sheet's row may name its own).
  const skillId = attackSkillId(mode, thrown, resolved, request, context);
  const skill = skillId ? registry.skills.find((entry) => entry.id === skillId) : undefined;
  if (!skill) return { ok: false, error: 'UNKNOWN_SKILL' };

  // An object has neither a head nor hands, so the −8 and the effects of an
  // aimed shot are simply off for cover and for a patch of ground — silently,
  // because the bar keeps the shooter's last choice armed and refusing the shot
  // over it would be noise.
  //
  // The same silence covers shot: „Bronią załadowaną amunicją śrutową nie można
  // Celować" (s. 174) is a fact about the load, not a mistake in the request.
  //
  // Melee is *not* excluded: „Wykonujesz pojedynczy … atak Dystansowy lub
  // Wręcz, z modyfikatorem -8" (s. 170) — a machete may be aimed at a head.
  const aimedAt: CpredAimPoint | undefined =
    request.aimedAt !== undefined &&
    canAimInMode(mode) &&
    ammo?.noAim !== true &&
    target.cover !== true &&
    target.point !== true
      ? request.aimedAt
      : undefined;
  const aimed = aimedAt !== undefined;
  const location: CpredHitLocation = aimedAt ? hitLocationForAim(aimedAt) : 'body';

  // „każdy … otrzymuje 3k6 obrażeń" — a shell's damage is the shell's, not the
  // gun's, and it does not care what the sheet's row says the shotgun does.
  const damage =
    mode === 'autofire'
      ? CPRED_AUTOFIRE_DAMAGE
      : spread
        ? spread.damage
        : attackDamageNotation(
            row,
            // Etap 39: BC **jak teraz** — obrażenia wręcz idą z tabeli BC
            // (s. 176), więc obniżona Budowa Ciała bije słabiej.
            cpredEffectiveStats(data),
            weaponTypeId,
            hasCyberarm(data.cyberware),
          );
  if (mode !== 'suppressive') {
    const parsed = parseRollNotation(damage);
    if (!parsed.ok || !parsed.formula.terms.some((term) => term.kind === 'dice')) {
      return { ok: false, error: 'BAD_DAMAGE' };
    }
  }

  const dvResult = attackDv(
    mode,
    melee,
    { rangeDv, autofire: resolved?.autofire, ...(spread ? { spreadDv: spread.dv } : {}) },
    target,
  );
  if (dvResult === 'OUT_OF_RANGE') return { ok: false, error: 'OUT_OF_RANGE' };

  // Modifier breakdown, in the order the rules apply it.
  const wound = cpredSheetWoundCondition(data);
  const state = wound.state;
  const statId = skill.stat;
  const breakdown: RollBreakdownEntry[] = [
    {
      label: `${CPRED_STAT_LABELS[statId].name} (${CPRED_STAT_LABELS[statId].abbr})`,
      value: data.stats[statId],
      kind: 'stat',
    },
    // Etap 39: efekty czasowe własnymi wierszami, jak w planerze Testów —
    // „REF 8 · Lisz −3" zamiast cichej ósemki, która strzela za piątkę.
    ...cpredStatEffectRows(data, statId).map((row) => ({
      label: row.label,
      value: row.value,
      kind: 'situational' as const,
    })),
    {
      label: (data.skills[skill.id] ?? 0) > 0 ? skill.name : `${skill.name} (nietrenowana)`,
      value: data.skills[skill.id] ?? 0,
      kind: 'skill',
    },
  ];
  // „Gdy atakujesz za pomocą broni doskonałej jakości, dodajesz +1 do Testów
  // ataku" (s. 244). Read off the weapon actually being fired, so a shot from
  // the launcher under an excellent rifle does not borrow the rifle's +1: the
  // quality belongs to the gun somebody bought, not to what is bolted under it.
  if (resolved?.quality === 'excellent') {
    breakdown.push({
      label: CPRED_EXCELLENT_LABEL,
      value: CPRED_EXCELLENT_ATTACK_BONUS,
      kind: 'situational',
    });
  }
  // „Modyfikator pancerza: −2 REF, ZW i RUCH" (s. 185). An attack is a Check on
  // one of exactly the two Stats the column names, so the jacket is felt here
  // before anything else the shot picks up.
  const armorPenalty = cpredArmorStatPenalty(data.armor, statId, cpredEffectiveStats(data)[statId]);
  if (armorPenalty !== 0) {
    breakdown.push({
      label: CPRED_ARMOR_PENALTY_LABEL,
      value: armorPenalty,
      kind: 'situational',
    });
  }
  // Kara za rany razem z tym, co ją zawiesza (Stym, Edytor bólu) — ta sama
  // funkcja co w planerze Testów, żeby atak i Test nie liczyły jej dwojako.
  breakdown.push(...cpredWoundPenaltyRows(wound));
  // „Za 3 punkty dodajesz +1 do każdego wykonywanego Ataku" (s. 146). Read off
  // the sheet rather than passed in, so the client's preview and the server's
  // verdict reach the same number without a context object between them.
  const awareness = cpredSheetCombatAwareness(data, registry);
  if (awareness.attack > 0) {
    breakdown.push({
      label: `Precyzyjny atak ${awareness.attack}`,
      value: awareness.attack,
      kind: 'situational',
    });
  }
  // Stage 31: „Celownik noktowizyjny … zmniejsza do zera modyfikatory ujemne za
  // strzelanie do celu ukrytego w ciemności, dymie, mgle itp." (s. 343).
  //
  // Dropped rather than cancelled with a matching plus: the rulebook says the
  // penalty stops existing, and „Dym −4 · Noktowizor +4" on a card would be
  // arithmetic theatre. Only the *negative* ones go — a cloud somebody made
  // helpful stays helpful.
  const seesThroughObscurement = attachmentIgnoresObscurement(attachments);
  for (const entry of context.modifiers ?? []) {
    const obscures = entry.kind === CPRED_OBSCUREMENT_KIND && entry.value < 0;
    if (seesThroughObscurement && obscures) continue;
    breakdown.push({ ...entry });
  }
  // What is bolted to the gun, when this shot earns it: the smartgun's flat +1
  // (chrome permitting) and the scope's conditional one. Both are decided here
  // rather than baked into the resolved weapon, because both conditions are
  // facts about *this shot* — see `attachmentAttackModifiers`.
  for (const entry of attachmentAttackModifiers(attachments, {
    metres: target.metres,
    single: mode === 'single',
    aimed,
    melee,
    cyberware: installedCyberware,
  })) {
    breakdown.push(entry);
  }
  if (aimedAt) {
    breakdown.push({
      label: `Celowanie (${CPRED_AIM_POINT_LABELS[aimedAt].toLowerCase()})`,
      value: CPRED_AIMED_SHOT_PENALTY,
      kind: 'situational',
    });
  }
  if (modifier !== 0) {
    breakdown.push({ label: 'Modyfikator sytuacyjny', value: modifier, kind: 'situational' });
  }
  if (luckSpent > 0) {
    breakdown.push({ label: `Szczęście (${luckSpent} pkt)`, value: luckSpent, kind: 'luck' });
  }

  const modifierTotal = breakdown.reduce((sum, entry) => sum + entry.value, 0);
  const terms: RollTerm[] = [{ kind: 'dice', sign: 1, count: 1, sides: 10 }];
  if (modifierTotal !== 0) {
    terms.push({
      kind: 'modifier',
      sign: modifierTotal < 0 ? -1 : 1,
      value: Math.abs(modifierTotal),
    });
  }

  const band = melee || mode === 'suppressive' ? null : rangeBandFor(target.metres);
  // A fence's toll belongs to a shot with one line (stage 42b). A swing never gets
  // through the mesh, suppressive fire deals no damage, and a blast or a cone
  // measures a line per figure it reaches.
  const barrierSp =
    !melee &&
    !explosive &&
    !spread &&
    mode !== 'suppressive' &&
    (target.tokenId !== undefined || target.coverId !== undefined)
      ? Math.max(0, Math.round(context.barrierSp ?? 0))
      : 0;
  // „Militech »Ronin« · granatnik podwieszany → Bandyta": the host still names
  // the object being held, because that is the row on the sheet and the thing
  // somebody has to reload.
  const weaponLabel = firedWith ? `${hostRow.name} · ${firedWith.name}` : row.name;
  const title =
    mode === 'single'
      ? `${weaponLabel} → ${target.name}`
      : `${weaponLabel} → ${CPRED_ATTACK_MODE_LABELS[mode].toLowerCase()}`;

  return {
    ok: true,
    plan: {
      title,
      formula: { terms },
      breakdown,
      modifierTotal,
      woundState: state,
      luckSpent,
      attack: {
        mode,
        modeLabel: CPRED_ATTACK_MODE_LABELS[mode],
        weaponRowId: row.id,
        weaponName: row.name,
        melee,
        damage,
        location,
        aimed,
        ...(aimedAt ? { aimedAt } : {}),
        targetName: target.name,
        ...(target.tokenId ? { targetTokenId: target.tokenId } : {}),
        ...(target.coverId !== undefined ? { targetCoverId: target.coverId } : {}),
        metres: target.metres,
        rangeLabel: band ? rangeBandLabel(band) : null,
        dv: dvResult.dv,
        dvSource: dvResult.source,
        ...(mode === 'autofire' && resolved?.autofire
          ? { autofireMax: resolved.autofire.max }
          : {}),
        ...(thrown ? { thrown: true as const } : {}),
        ...(halvesArmor ? { halvesArmor: true as const } : {}),
        ...(barrierSp > 0 ? { barrierSp } : {}),
        ...(awareness.ignoresFumble ? { ignoresFumble: true as const } : {}),
        ...(awareness.weakSpot > 0 ? { weakSpot: awareness.weakSpot } : {}),
        ...(explosive ? { blastSideM: CPRED_BLAST_SIDE_M } : {}),
        ...(ammo ? { ammo } : {}),
        ...(spread ? { coneRangeM: spread.coneRangeM } : {}),
        statId,
        ...(firedWith ? { attachmentId: firedWith.id, attachmentName: firedWith.name } : {}),
        ammoCost,
        ammoBefore: row.ammoCurrent,
        ammoAfter: row.ammoCurrent - ammoCost,
        ...(row.ammoMax > 0 ? { ammoMax: row.ammoMax } : {}),
      },
    },
  };
}

/** Rounds an attack spends: one per shot, ten per burst, none if untracked. */
export function attackAmmoCost(
  mode: CpredAttackMode,
  row: Pick<CpredWeaponRow, 'ammoMax'>,
): number {
  if (row.ammoMax <= 0) return 0;
  return mode === 'single' ? 1 : CPRED_BURST_AMMO_COST;
}

/**
 * Which skill this attack rolls.
 *
 * Bursts always use „Ogień ciągły"; anything let go of uses Athletics, because
 * the rules describe the throw itself rather than the object („testując ZW +
 * Atletyka", s. 177) — a grenade type may still name its own, which is how the
 * catalogue stays the place skills are decided.
 */
function attackSkillId(
  mode: CpredAttackMode,
  thrown: boolean,
  resolved: ResolvedWeapon | null,
  request: CpredAttackRequest,
  context: CpredAttackContext,
): string | null {
  if (mode !== 'single') return CPRED_AUTOFIRE_SKILL_ID;
  if (thrown) {
    if (resolved?.thrown === true && resolved.skillId) return resolved.skillId;
    return context.throwProfile?.skillId ?? CPRED_THROW_SKILL_ID;
  }
  return resolved?.skillId ?? request.skillId ?? null;
}

type DvResult = { dv: number | null; source: CpredAttackMeta['dvSource'] };

function attackDv(
  mode: CpredAttackMode,
  melee: boolean,
  resolved: { rangeDv?: RangeDvTable; autofire?: AutofireProfile; spreadDv?: number },
  target: CpredAttackTarget,
): DvResult | 'OUT_OF_RANGE' {
  // The suppressing player's own total becomes the DV their targets face.
  if (mode === 'suppressive') return { dv: null, source: 'suppressive' };
  // A spread of shot ignores the range table entirely: „wykonujesz 1 atak
  // dystansowy … przeciwko PT 13" whether the target is at 2 m or at 6 (s. 174).
  if (resolved.spreadDv !== undefined) return { dv: resolved.spreadDv, source: 'spread' };
  if (melee) {
    return target.evasionDv !== undefined
      ? { dv: target.evasionDv, source: 'evasion' }
      : { dv: CPRED_EVERYDAY_DV, source: 'everyday' };
  }
  const dv =
    mode === 'autofire'
      ? autofireDvForRange(resolved?.autofire, target.metres)
      : dvForRange(resolved?.rangeDv, target.metres);
  if (dv === null) return 'OUT_OF_RANGE';
  return { dv, source: mode === 'autofire' ? 'autofire' : 'range' };
}

/** Outcome of one attack roll against its DV. */
export interface CpredAttackOutcome {
  hit: boolean;
  /** How far the roll beat the DV; 0 or less on a miss. */
  margin: number;
  /** Burst damage multiplier, present only for autofire hits. */
  multiplier?: number;
}

/**
 * Judges a roll against a DV. Ties go to the defender, so the total has to be
 * strictly higher — the single place that rule is encoded.
 */
export function resolveCpredAttack(
  total: number,
  dv: number,
  autofireMax?: number,
): CpredAttackOutcome {
  const margin = total - dv;
  const hit = margin > 0;
  if (!hit) return { hit, margin };
  return {
    hit,
    margin,
    ...(autofireMax ? { multiplier: autofireMultiplier(margin, autofireMax) } : {}),
  };
}

/** One target's forced WILL check against suppressive fire. */
export interface CpredSuppressionResult {
  tokenId: string;
  name: string;
  metres: number;
  /** The 1d10 rolled for the check. */
  die: number;
  /** WILL + Concentration, without the die. */
  modifier: number;
  total: number;
  /** True when the target held its ground. */
  resisted: boolean;
}

/** WILL + „Koncentracja" of a sheet — the target's side of suppressive fire. */
export function concentrationBase(data: CpredCharacterData, registry: CpredRegistry): number {
  const skill = registry.skills.find((entry) => entry.id === CPRED_CONCENTRATION_SKILL_ID);
  const stats = cpredEffectiveStats(data);
  const stat = skill ? stats[skill.stat] : stats.will;
  return stat + (data.skills[CPRED_CONCENTRATION_SKILL_ID] ?? 0);
}

/** What one forced check is rolled on: the attribute, the skill, and its name. */
export interface CpredCheckBase {
  total: number;
  statId: CpredStatId;
  /** Name to print — the registry's when it has the skill, the row's otherwise. */
  label: string;
  /** Levels of the skill; 0 for untrained and for a skill this campaign lacks. */
  skillLevel: number;
}

/**
 * The target's side of a check some *round* forces on them (stage 16h).
 *
 * The generalisation of `concentrationBase`, and it degrades where that one
 * could not afford to: a campaign whose registry never heard of
 * „Cyberinżynieria" must still be able to roll against an EMP round. The
 * fallback is the attribute named on the catalogue row — a character who never
 * trained the skill rolls their TECH, which is exactly what RAW says an
 * untrained check is.
 */
export function cpredCheckBase(
  data: CpredCharacterData,
  registry: CpredRegistry,
  check: Pick<CpredAmmoCheck, 'skillId' | 'skillLabel' | 'statId'>,
): CpredCheckBase {
  const skill = registry.skills.find((entry) => entry.id === check.skillId);
  const statId = skill?.stat ?? check.statId ?? 'will';
  const skillLevel = skill ? (data.skills[check.skillId] ?? 0) : 0;
  return {
    total: cpredEffectiveStats(data)[statId] + skillLevel,
    statId,
    label: skill?.name ?? check.skillLabel ?? check.skillId,
    skillLevel,
  };
}

/** Polish problem messages, shown next to the weapon that could not fire. */
export const CPRED_ATTACK_PROBLEM_MESSAGES: Record<CpredAttackProblem, string> = {
  BAD_REQUEST: 'Nieprawidłowe żądanie ataku.',
  BAD_MODIFIER: `Modyfikator musi mieścić się w zakresie ±${CPRED_SITUATIONAL_MODIFIER_LIMIT}.`,
  NOT_ENOUGH_LUCK: 'Nie masz tylu punktów Szczęścia.',
  UNKNOWN_WEAPON: 'Ta broń nie ma tabeli zasięgów — uzupełnij typ broni w kompendium.',
  UNKNOWN_SKILL: 'Nie wiem, jaką umiejętnością strzelać z tej broni.',
  BAD_DAMAGE: 'Obrażenia broni nie są poprawną notacją kości.',
  NO_AUTOFIRE: 'Ta broń nie ma ognia ciągłego.',
  NO_SUPPRESSIVE: 'Tą bronią nie poprowadzisz ognia zaporowego.',
  OUT_OF_RANGE: 'Cel jest poza zasięgiem tej broni.',
  MELEE_OUT_OF_REACH: `Do ataku wręcz cel musi być nie dalej niż ${CPRED_MELEE_REACH_M} m.`,
  MELEE_BLOCKED: 'Między wami stoi przeszkoda — wręcz przez nią nie sięgniesz.',
  RANGED_WEAPON_IN_MELEE: 'Tej broni nie użyjesz w zwarciu.',
  NOT_ENOUGH_AMMO: 'Za mało amunicji — przeładuj broń.',
  GRAPPLE_TWO_HANDED: 'W Trzymaniu nie można używać broni dwuręcznych.',
  NO_LINE_OF_FIRE: 'Cel za przeszkodą — nie masz linii strzału.',
  TARGET_BEHIND_COVER: 'Cel jest za osłoną — ostrzelaj osłonę albo strzelaj mimo niej.',
  COVER_NOT_SUPPRESSIBLE: 'Ogniem zaporowym nie zmusisz przedmiotu, żeby się schował.',
  AMMO_MISMATCH: 'Ten nabój nie pasuje do tej broni — zmień amunicję.',
  AMMO_SINGLE_ONLY: 'Tą amunicją strzelasz tylko pojedynczo.',
  AMMO_NEEDS_CYBERWARE: 'Ta amunicja nie wystrzeli bez wymaganej cyborgizacji.',
  UNKNOWN_ATTACHMENT: 'Nie ma takiego dodatku na tej broni.',
  WEAPON_JAMMED: CPRED_JAM_REFUSAL,
  WEAPON_NOT_DRAWN: CPRED_NOT_DRAWN_REFUSAL,
  WEAPON_HOLSTERED: CPRED_HOLSTERED_REFUSAL,
};
