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
 *  - **Luck, Humanity, the Death Save counter** — the parts of the sheet that
 *    describe a person with a story. A statist that starts needing them has
 *    stopped being a statist and wants a real sheet, which is two clicks away
 *    in the token menu.
 *
 * Critical Injuries were on that list until 29.08 and came off it, because the
 * reason they were there stopped being true. They were excluded as „something
 * the GM types in", and a typed wound is indeed a sheet's business — but tear
 * gas, a flashbang and a defended zone *inflict* them by rule (16h, 26f), and
 * a statist with nowhere to keep one meant the rule stopped at a sentence on
 * the card. The profile therefore carries the wounds the rules put there, and
 * `combatProfileSheet` hands them to the very code that already enforces them:
 * no branch anywhere learns that this dodge was refused to a statist.
 */

import { humanityMax } from './derived.js';
import { isValidCompendiumId } from './ids.js';
import { ARMOR_SP_MAX } from './locations.js';
import { CPRED_STAT_MAX, CPRED_STAT_MIN, type CpredStats } from './stats.js';
import { cpredEffectiveStats } from './stateffects.js';
import {
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  sanitizeCriticalInjuryRows,
  type CpredCharacterData,
  type CpredCriticalInjuryRow,
} from './character.js';
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
  /**
   * RUCH, when this figure has one worth naming (stage 30c). Absent on every
   * profile stage 16b wrote, which keeps their JSON byte-identical — a statist
   * without it walks at the ordinary human's 5.
   *
   * Here because Backup officers arrive with a printed one: „RUCH i BC: Cechy
   * Ruch i BC Wsparcia, istotne przy rozpatrywaniu dystansu" (s. 158), and a
   * C-SWAT trooper who covers the same ground as a passer-by would make the
   * table's metres a lie.
   */
  move?: number;
  /**
   * „Funkcjonariusze Wsparcia nie mogą Unikać pocisków" (s. 158, stage 30c).
   *
   * A real flag rather than an `evasion` of zero, because in this project the
   * two are not the same thing: `attack:evade` ducks bullets as happily as
   * blades, so a zero would still buy a 1d10 against the shot. And it is
   * ranged-only, exactly as printed — an officer parries a machete with his
   * Wartość bojowa like anybody else. The twin of the Human Shield's own
   * refusal in `attack:evade`, and blocked in the same place.
   */
  noBulletDodge?: boolean;
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
  /**
   * Critical Injuries the rules have inflicted on this statist (29.08).
   *
   * Absent on every profile that has never been hurt by a rule that names a
   * wound — which is almost all of them — so an untouched ganger's JSON is
   * byte-identical to what stage 16b wrote. The rows are the sheet's own shape
   * (`CpredCriticalInjuryRow`), including the 16h timer, because the wound is
   * literally the same wound: the same compendium row copied by the same
   * function.
   */
  criticalInjuries?: CpredCriticalInjuryRow[];
  /**
   * Umiejętności, którymi ta figura wolno jej rzucić — id → poziom (30.08).
   *
   * Do tej pory statysta rzucał wyłącznie bronią i Unikiem, bo `skillLevel`
   * jest **jedną** liczbą: gdyby wystarczyła za każdą Umiejętność, ganger
   * z Umiejętnością 4 byłby równie dobrym księgowym co strzelcem. To pole jest
   * odwrotną stroną tej samej decyzji — nie „statysta umie wszystko na jednym
   * poziomie", tylko „statysta umie **to**, i tyle".
   *
   * Wstawia je reguła (Wsparcie 10. poziomu przynosi swoich piętnaście —
   * „mogą oni wykorzystać swoją Wartość bojową w Testach poniższych
   * Umiejętności", s. 159) albo ręka MG w edytorze profilu. Nieobecne na
   * każdym profilu, którego nikt nie tknął, dokładnie z tego powodu, dla
   * którego nieobecne bywa `criticalInjuries`: JSON nietkniętego gangera ma
   * wracać bajt w bajt tym, co zapisał etap 16b.
   */
  skills?: Record<string, number>;
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

/**
 * Najwyższy poziom Umiejętności w profilu figury bez karty — **nie** dziesiątka
 * z karty postaci (błąd znaleziony 31.08).
 *
 * Do 31.08 profil klampował się do `SKILL_LEVEL_MAX`, czyli do limitu, który
 * RAW nakłada na **Umiejętność postaci**. Statysta jednak trzyma tu coś innego:
 * Wartość bojową — „Umiejętność bazowa używana do ataku i obrony. Reprezentuje
 * sumę Cechy i Umiejętności funkcjonariusza" (s. 158). Cztery z sześciu
 * kategorii Wsparcia mają ją powyżej dziesięciu (14, 16, 15, 14) i wszystkie
 * cztery były po cichu ścinane do 10 przy **każdym odczycie** żetonu: C-SWAT
 * strzelał i bronił się jak krawężnik. To samo groziło Demonom (14).
 *
 * Sufitem jest więc suma obu limitów, bo dokładnie tym Wartość bojowa jest.
 */
export const STATIST_SKILL_LEVEL_MAX = CPRED_STAT_MAX + SKILL_LEVEL_MAX;

/** Most wounds one statist's profile will keep — the two tables hold 22. */
export const STATIST_INJURY_MAX = 12;

/**
 * Ile Umiejętności zmieści się w profilu. Piętnaście przynosi Wsparcie
 * 10. poziomu (s. 159) i to jest najdłuższa lista, jaką drukuje podręcznik;
 * dwadzieścia zostawia MG zapas, a jednocześnie mówi, że to nadal jest figura
 * bez karty. Statysta, któremu brakuje miejsca, chce prawdziwej karty.
 */
export const STATIST_SKILL_MAX = 20;

/**
 * Czyta listę Umiejętności profilu, naprawiając co się da.
 *
 * Nieznane id **wypada po cichu**, tak jak w `validateSkills` na karcie:
 * pliki danych potrafią się skurczyć, a figura, która przestaje istnieć, bo
 * z `skills.json` zniknął wiersz, jest gorsza niż figura bez tego rzutu.
 * Poziom 0 też wypada — to jest lista „co ta figura umie", a umieć coś na
 * zero znaczy nie umieć.
 */
function sanitizeProfileSkills(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null) return {};
  const skills: Record<string, number> = {};
  for (const [id, level] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(skills).length >= STATIST_SKILL_MAX) break;
    if (typeof id !== 'string' || !isValidCompendiumId(id)) continue;
    if (typeof level !== 'number' || !Number.isFinite(level)) continue;
    const value = clampInt(level, SKILL_LEVEL_MIN, STATIST_SKILL_LEVEL_MAX, 0);
    if (value > 0) skills[id] = value;
  }
  return skills;
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
  const injuries = sanitizeCriticalInjuryRows(input.criticalInjuries).slice(0, STATIST_INJURY_MAX);
  const skills = sanitizeProfileSkills(input.skills);
  return {
    ref: clampInt(input.ref, CPRED_STAT_MIN, CPRED_STAT_MAX, base.ref),
    dex: clampInt(input.dex, CPRED_STAT_MIN, CPRED_STAT_MAX, base.dex),
    body: clampInt(input.body, CPRED_STAT_MIN, CPRED_STAT_MAX, base.body),
    will: clampInt(input.will, CPRED_STAT_MIN, CPRED_STAT_MAX, base.will),
    // Oba sufity to `STATIST_SKILL_LEVEL_MAX`, nie limit karty: Wsparcie
    // atakuje **i broni się** tą samą Wartością bojową (s. 158), więc ścięty
    // Unik byłby dokładnie tym samym błędem co ścięty atak.
    skillLevel: clampInt(
      input.skillLevel,
      SKILL_LEVEL_MIN,
      STATIST_SKILL_LEVEL_MAX,
      base.skillLevel,
    ),
    evasion: clampInt(input.evasion, SKILL_LEVEL_MIN, STATIST_SKILL_LEVEL_MAX, base.evasion),
    // Both omitted when they carry nothing, for the reason `criticalInjuries`
    // is: an untouched ganger's JSON has to round-trip to what 16b wrote.
    ...(typeof input.move === 'number' && Number.isFinite(input.move)
      ? { move: clampInt(input.move, CPRED_STAT_MIN, CPRED_STAT_MAX, STATIST_DEFAULT_STAT) }
      : {}),
    ...(input.noBulletDodge === true ? { noBulletDodge: true as const } : {}),
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
    // Repaired like everything else here, and omitted entirely when empty: an
    // unhurt statist's profile must round-trip to the same JSON it arrived as.
    ...(injuries.length > 0 ? { criticalInjuries: injuries } : {}),
    // Ta sama umowa, ten sam powód (30.08): figura, której nikt nie nadał
    // żadnej Umiejętności, ma zapisywać się tak, jak zapisywał ją etap 16b.
    ...(Object.keys(skills).length > 0 ? { skills } : {}),
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
    move: profile.move ?? STATIST_DEFAULT_STAT,
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
    // No Role means no Special Ability (stage 30a): `cpredRoleAbilityRank`
    // refuses a sheet with a null `roleId` before it ever reads this, and
    // stage 29b's list of previous ones is empty for the same reason — a
    // statist has no career behind him, only a gun.
    formerRoles: [],
    // Etap 39 zostawił efekty czasowe na kartach: „efekty na figurach bez karty"
    // są poza zakresem tego etapu, a statysta trzyma liczby w `combatProfile`,
    // nie w wierszach. Pusta lista, żeby `cpredEffectiveStats` miał co czytać.
    statEffects: [],
    combatAwareness: {},
    // Stage 30b: a statist has no Role, so neither Specialty purse is ever read.
    medicine: {},
    fabrication: {},
    // Nor does anybody work for him (stage 30c): a team is something a Korpo's
    // sheet carries, and a statist is the figure that has no sheet.
    team: [],
    // Stage 30d: no Family to lend him a car, and nobody haggles on his behalf.
    fleet: [],
    haggle: null,
    // Unik zawsze z własnego pola, choćby MG wpisał go też na listę: to on
    // stoi w edytorze profilu i to jego czyta obrona statysty.
    skills: { ...(profile.skills ?? {}), [CPRED_EVASION_SKILL_ID]: profile.evasion },
    // Statysta nie ma czego nazywać: jego jedyną umiejętnością jest Unik.
    skillSpecialties: {},
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
    // The wounds the rules put there, handed to the code that enforces them:
    // „Odcięta noga" refuses this statist a dodge through `cpredInjuryDodgeBlock`
    // and „Wstrząśnienie mózgu" costs it −2 through `cpredInjuryModifiers`,
    // both without either function learning what a statist is.
    criticalInjuries: profile.criticalInjuries ?? [],
    deathSaves: 0,
    // Naturalne leczenie statysty nie dotyczy: karta powstaje na jedną walkę
    // i po niej znika, a dzień odpoczynku pyta o kartę, która przeżyje noc.
    // Statyście, który zaczyna wracać do zdrowia, MG daje prawdziwą kartę —
    // to samo rozstrzygnięcie co przy Szczęściu i Człowieczeństwie wyżej.
    recovery: { stabilized: false, antibioticDays: 0 },
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
    // Ani strony drugiej (27c): nikt go nie zna po ksywie i nikt nie przyznaje
    // mu Punktów Doświadczenia.
    aliases: '',
    improvementPoints: 0,
    // Ani cyberdeku (26a): sieciuje Netrunner, a statysta ma być przeciwnikiem
    // na jedną wymianę ognia — wrogi netrunner to osobna, prawdziwa karta.
    cyberdeck: null,
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
  if (skillId === CPRED_EVASION_SKILL_ID) return profile.evasion;
  // Umiejętność wpisana wprost wygrywa z liczbą od broni (30.08). Kolejność
  // jest tu jedyną możliwą: `skillLevel` nie wie, którą Umiejętnością strzela
  // ta broń, więc gdyby wygrywał on, wpisany poziom nie znaczyłby nic.
  return profile.skills?.[skillId] ?? profile.skillLevel;
}

/**
 * Umiejętności, którymi ta figura **wolno** rzucić poza walką (30.08).
 *
 * Nie to samo, co `combatProfileSkillLevel`: tamta odpowiada „na ilu",
 * a ta „czy w ogóle". Rozdział jest celowy — atak pyta o poziom Umiejętności,
 * którą strzela broń, i ma dostać `skillLevel` także wtedy, gdy nikt tej
 * Umiejętności nie wpisał; Test Percepcji ma nie istnieć, dopóki ktoś nie
 * powie, że ta figura umie patrzeć.
 */
export function combatProfileRollableSkills(profile: CpredCombatProfile): string[] {
  return Object.keys(profile.skills ?? {});
}

/**
 * The same turret, with somebody else's hands on it (stage 26d).
 *
 * „Gdy system jest pod kontrolą Netrunnera, wszelkie ataki i Testy obrony
 * wykonuje, rzucając na Umiejętności tego Netrunnera, tak jakby ten strzelał
 * z trzymanych w rękach broni" (s. 213). Everything about the *weapon* stays
 * the turret's — its barrel, its magazine, its plating — and everything about
 * the *shooter* becomes the operator's.
 *
 * A substitution rather than a branch in the planner, and that is the whole
 * point: the attack that follows goes through `performAttackRoll` unchanged, so
 * range, cover, line of fire, ammunition and the damage card all behave exactly
 * as they do when a person pulls the trigger.
 */
export function combatProfileOperatedBy(
  profile: CpredCombatProfile,
  operator: Pick<CpredCharacterData, 'stats' | 'skills' | 'humanityCurrent' | 'statEffects'>,
  skillId: string | null,
): CpredCombatProfile {
  const skillLevel = skillId ? (operator.skills[skillId] ?? 0) : profile.skillLevel;
  // Etap 39: Cechy operatora **jak teraz** — wieżyczka strzela jego refleksem,
  // więc godzina pod Nerwosolem obniża też celność zdalnego działka.
  const stats = cpredEffectiveStats(operator);
  return {
    ...profile,
    ref: stats.ref,
    dex: stats.dex,
    body: stats.body,
    will: stats.will,
    skillLevel,
    evasion: operator.skills[CPRED_EVASION_SKILL_ID] ?? 0,
  };
}

/**
 * The same turret with a machine's hand on it (stage 26e).
 *
 * „W czasie samodzielnego działania systemy obronne określają skuteczność
 * swoich działań, wykonując Test Wartości bojowej + 1k10" (s. 214), and a Demon
 * working a control node rolls the same single number (s. 212). Wartość bojowa
 * is Stat *and* Skill merged into one figure, so it goes into the Skill half and
 * the Stats go to zero: a machine has no reflexes to add, and the breakdown then
 * reads honestly („Refleks (REF) +0 · Broń długa 14") instead of pretending the
 * turret has a nervous system.
 *
 * Everything about the *weapon* stays the turret's, exactly as in 26d — the
 * barrel, the magazine, the plating. Evasion goes to zero too: „nie mogą unikać
 * ataków" (s. 214).
 */
export function combatProfileWithCombatValue(
  profile: CpredCombatProfile,
  combatValue: number,
): CpredCombatProfile {
  const value = Math.max(0, Math.round(combatValue));
  return { ...profile, ref: 0, dex: 0, body: 0, will: 0, skillLevel: value, evasion: 0 };
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
  const listed = profile.skills?.[skillId] !== undefined;
  return {
    ...sheet,
    // Umiejętność **wpisana na listę** niesie pełny modyfikator, więc Cechy idą
    // do zera — dokładnie ta sama decyzja, którą `combatProfileWithCombatValue`
    // podejmuje dla wieżyczki, i z tego samego powodu. „Wartość bojowa […]
    // reprezentuje sumę Cechy i Umiejętności funkcjonariusza" (s. 158): agent
    // federalny rzucający Dedukcją na 14 + INT 5 liczyłby swoją Cechę dwa razy.
    //
    // Rzut bronią zostaje po staremu (REF + poziom), bo `skillLevel` jest
    // poziomem Umiejętności, a nie sumą — chyba że MG sam wpisał tę broń na
    // listę, i wtedy to jest jego deklaracja pełnego modyfikatora.
    ...(listed
      ? { stats: { ...sheet.stats, int: 0, ref: 0, dex: 0, tech: 0, cool: 0, will: 0, emp: 0 } }
      : {}),
    skills: { ...sheet.skills, [skillId]: combatProfileSkillLevel(profile, skillId) },
  };
}
