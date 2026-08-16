/**
 * Netrunning — the catalogue's shape and the Net Architecture model (stage 26a).
 *
 * Three separate things live here, and they are separate on purpose:
 *
 *  - **Program numbers** (`CpredNetProgramProfile`) ride on a compendium entry,
 *    the way ammunition effects do. Class and target are *data*: „przeciw-
 *    białkowy" and „przeciwprogramowy" decide what a Program may be pointed at,
 *    and stage 26b reads those fields rather than comparing names.
 *  - **The architecture** (`CpredNetArchitecture`) is a lift shaft: floors from
 *    the top down, optionally with side branches. It is campaign data, not
 *    scene data — the same „sieć klubu Afterlife" can hang off several places,
 *    and a run survives a scene change.
 *  - **The rolling tables** (`CpredNetrunningData`) come from a data file, like
 *    the creation and lifepath tables. The generator below is the rulebook's
 *    own step 1 and step 2 (s. 210) and nothing more.
 *
 * What deliberately is *not* here: the run itself. Where the netrunner stands,
 * what they have uncovered and which Programs are running is stage 26b's state,
 * and it points at an architecture rather than living inside one — otherwise
 * two runs against the same building would fight over one object.
 */

import type { DiceRng } from '../../dice.js';
// Type-only on purpose: `character.ts` imports this module for the registry
// field, so a value import back would close a cycle. The same goes for
// `netrun.ts`, which imports the architecture model from here — a Booster names
// the Interface ability it helps, and that name is defined over there.
import type { CpredRegistry } from './character.js';
import type { NetAbilityId } from './netrun.js';
import type { CpredAmmoCheck } from './ammo.js';
import { slugify } from './ids.js';
import { describeCpredDuration } from './timed.js';

// ───────────────────────────────── Programy ─────────────────────────────────

/** The three non-ICE Program classes of the rulebook (s. 202). */
export const NET_PROGRAM_CLASSES = ['booster', 'defender', 'attacker'] as const;
export type NetProgramClass = (typeof NET_PROGRAM_CLASSES)[number];

export const NET_PROGRAM_CLASS_LABELS: Record<NetProgramClass, string> = {
  booster: 'Dopalacz',
  defender: 'Obrońca',
  attacker: 'Agresor',
};

/**
 * What a Program is allowed to hurt. „Program, którego Klasa wskazuje na rodzaj
 * celu […] zadaje obrażenia tylko celom odpowiedniego rodzaju" (s. 201) — so
 * this is a rule, not a label, and stage 26b refuses a mismatched target.
 */
export const NET_PROGRAM_TARGETS = ['antiPersonnel', 'antiProgram'] as const;
export type NetProgramTarget = (typeof NET_PROGRAM_TARGETS)[number];

export const NET_PROGRAM_TARGET_LABELS: Record<NetProgramTarget, string> = {
  antiPersonnel: 'przeciwbiałkowy',
  antiProgram: 'przeciwprogramowy',
};

/** Deck slots a Black ICE Program takes: „każdy zajmuje 2 gniazda deku" (s. 204). */
export const NET_BLACK_ICE_SLOTS = 2;
export const NET_PROGRAM_STAT_MAX = 30;

// ─────────────────────── efekt Programu jako dane (26c) ───────────────────────

/**
 * The „Efekt" column, in numbers instead of prose (stage 26c).
 *
 * Every Program in the rulebook prints one sentence saying what it does, and
 * stage 26c has to act on it. Reading that sentence in code would mean a
 * `switch` over Polish names — and a GM who invents „Kolczatka" would get a
 * Program the engine politely ignores. So the sentence stays as the entry's
 * description (what the table reads) and these fields carry what the engine
 * needs (what the table gets). Adding a Program is filling a form, not a patch.
 *
 * Nothing here is required: an entry with no `effects` is a Program the GM
 * adjudicates by hand, which is exactly how it worked before this stage.
 */
export const NET_PROGRAM_HOOKS = [
  /** „wyrzucany z Architektury bez zachowania środków bezpieczeństwa" (s. 204). */
  'eject',
  /** „zmniejsza o 1 (do minimum 2) liczbę Akcji Sieciowych… w kolejnej Turze". */
  'stealNetAction',
  /** Superklej i Kraken: ani niżej, ani bezpiecznego odłączenia. */
  'glue',
  /** „cyberdek oraz ubranie zaczynają się palić" — status Podpalony z 16h. */
  'burn',
  /** Kruk: „derezuje jeden losowo wybrany, zrezowany Program obronny". */
  'derezDefender',
  /** Żmija, Trujący zgon: „niszczy jeden losowy Program… na cyberdeku celu". */
  'destroyProgram',
  /** Skunks: „wszystkie Testy Ślizgu z modyfikatorem −2". */
  'slidePenalty',
  /** Nerwosol, Lisz: „na godzinę obniża o 1k6 INT, REF oraz ZW" — stosuje MG. */
  'statDrain',
  /** Skorpion: „na następną godzinę RUCH spada o 1k6" — stosuje MG. */
  'moveDrain',
] as const;
export type NetProgramHook = (typeof NET_PROGRAM_HOOKS)[number];

export const NET_PROGRAM_HOOK_LABELS: Record<NetProgramHook, string> = {
  eject: 'wyrzucenie z Architektury',
  stealNetAction: '−1 Akcja Sieciowa w kolejnej Turze',
  glue: 'ani niżej, ani bezpiecznego odłączenia',
  burn: 'dek i ubranie płoną',
  derezDefender: 'derez losowego Obrońcy',
  destroyProgram: 'zniszczenie Programu na deku',
  slidePenalty: '−2 do Testów Ślizgu',
  statDrain: 'INT, REF i ZW −1k6 na godzinę',
  moveDrain: 'RUCH −1k6 na godzinę',
};

/**
 * Hooks the engine names and the **GM** applies (decision of 15.08).
 *
 * Both are „na godzinę": a clock that runs outside the fight, on a Stat the
 * sheet has no way to lower for an hour and put back. Automating them would
 * mean a temporary-modifier model the project does not have — so the card says
 * what happened, in Polish, and the GM writes it down.
 */
export const NET_PROGRAM_HOOKS_MANUAL: readonly NetProgramHook[] = ['statDrain', 'moveDrain'];

/** What a Defender does while it is rezzed (s. 203). */
export const NET_GUARD_KINDS = ['armour', 'shell', 'shield'] as const;
export type NetGuardKind = (typeof NET_GUARD_KINDS)[number];

export const NET_GUARD_KIND_LABELS: Record<NetGuardKind, string> = {
  armour: 'Pancerz — obniża obrażenia w mózg',
  shell: 'Powłoka — zeruje ATK Agresorów spoza Czarnego LOD-u',
  shield: 'Tarcza — kasuje pierwsze trafienie i derezuje się',
};

/** Default of „obniża obrażenia zadane mózgowi o 4" when the entry is silent. */
export const NET_GUARD_ARMOUR_DEFAULT = 4;

/** How long the glue holds: Superklej „1k6 Rund", Kraken „do końca kolejnej Tury". */
export const NET_GLUE_DURATIONS = ['d6rounds', 'nextTurn'] as const;
export type NetGlueDuration = (typeof NET_GLUE_DURATIONS)[number];

export interface CpredNetProgramEffects {
  /** k6 of damage against a Program that is not Black ICE. */
  vsProgram?: number;
  /** k6 of damage against Black ICE. */
  vsBlackIce?: number;
  /** k6 straight into the netrunner's HP — „bezpośrednio mózgowi". */
  vsBrain?: number;
  /** Dopalacz: „+2 do Testów Maskowania", „+2 Prędkości". */
  boost?: {
    value: number;
    /** Interface ability ids the bonus applies to (`scout`, `cloak`, …). */
    abilities?: NetAbilityId[];
    /** True when the bonus goes to PRĘDKOŚĆ — the Black ICE detection contest. */
    speed?: boolean;
  };
  /** Obrońca: which of the three it is, and how much when that is a number. */
  guard?: { kind: NetGuardKind; value?: number };
  hooks?: NetProgramHook[];
  /** Only read when `hooks` contains `glue`. */
  glue?: NetGlueDuration;
  /** „Jeśli Program byłby zderezowany, zamiast tego zostaje zniszczony." */
  destroys?: boolean;
  /** „Można uruchomić tylko 1 kopię tego Programu naraz." */
  singleCopy?: boolean;
  /** „Danej kopii można użyć tylko raz na wejście do Architektury Sieciowej." */
  oncePerEntry?: boolean;
}

export const NET_PROGRAM_DAMAGE_DICE_MAX = 12;
export const NET_PROGRAM_BOOST_MAX = 10;

/** The numbers printed in the Program and Black ICE tables (s. 203–207). */
export interface CpredNetProgramProfile {
  programClass: NetProgramClass;
  /** Absent on Boosters and Defenders, which hurt nothing. */
  target?: NetProgramTarget;
  /** Black ICE hunts on its own, costs two slots and has PER/PRĘ. */
  blackIce?: boolean;
  /** „ATK" — added to the attack Check. */
  atk: number;
  /** „OBR" — added to the defence Check. */
  def: number;
  /** „REZ" — the Program's hit points; at 0 it is derezzed, not destroyed. */
  rez: number;
  /** „PER" — the DV of escaping this ICE with Ślizg. Black ICE only. */
  per?: number;
  /** „PRĘ" — contested when the ICE first spots an intruder. Black ICE only. */
  speed?: number;
  /** Deck slots; absent means one (two for Black ICE). */
  slots?: number;
  /** „Ikona" — how the Program looks in the Net. Flavour the run window prints. */
  icon?: string;
  /**
   * What the „Efekt" column does, in numbers (stage 26c). Absent = a Program
   * the GM adjudicates: it still runs, attacks and takes damage, it just has
   * nothing automatic to hand out.
   */
  effects?: CpredNetProgramEffects;
}

/** „Zadaje 3k6 obrażeń Programom… lub 2k6 Programom typu Czarny LOD" (s. 203). */
export function netProgramDamageDice(
  profile: Pick<CpredNetProgramProfile, 'effects'>,
  target: 'program' | 'blackIce' | 'brain',
): number {
  const effects = profile.effects;
  if (!effects) return 0;
  if (target === 'brain') return effects.vsBrain ?? 0;
  if (target === 'blackIce') return effects.vsBlackIce ?? effects.vsProgram ?? 0;
  return effects.vsProgram ?? 0;
}

/** True when this Program has something to do to a target of that kind. */
export function netProgramHurts(
  profile: Pick<CpredNetProgramProfile, 'effects' | 'target'>,
  target: 'program' | 'blackIce' | 'brain',
): boolean {
  if (netProgramDamageDice(profile, target) > 0) return true;
  const hooks = profile.effects?.hooks ?? [];
  if (hooks.length === 0) return false;
  // A hook that only makes sense against a netrunner does not make a Program
  // an answer to Black ICE — „zadaje obrażenia tylko celom odpowiedniego
  // rodzaju" (s. 201) is a rule about the target's kind, not about the wording.
  const brainOnly: readonly NetProgramHook[] = [
    'eject',
    'stealNetAction',
    'glue',
    'burn',
    'derezDefender',
    'destroyProgram',
    'slidePenalty',
    'statDrain',
    'moveDrain',
  ];
  return target === 'brain' ? hooks.some((hook) => brainOnly.includes(hook)) : false;
}

/**
 * The numbers a catalogue row hands to whatever copies it — a deck slot, a
 * floor of an architecture, a Black ICE spawned in a run.
 *
 * One function rather than four spread-and-pick blocks, because the list of
 * fields grew twice already (PER/PRĘ in 26a, `effects` in 26c) and each time a
 * copy that forgot one produced a Program that looked right and did nothing.
 */
export function netProgramProfileOf(entry: CpredNetProgramProfile): CpredNetProgramProfile {
  return {
    programClass: entry.programClass,
    ...(entry.target ? { target: entry.target } : {}),
    ...(entry.blackIce ? { blackIce: true as const } : {}),
    atk: entry.atk,
    def: entry.def,
    rez: entry.rez,
    ...(entry.per !== undefined ? { per: entry.per } : {}),
    ...(entry.speed !== undefined ? { speed: entry.speed } : {}),
    ...(entry.slots !== undefined ? { slots: entry.slots } : {}),
    ...(entry.icon ? { icon: entry.icon } : {}),
    ...(entry.effects ? { effects: entry.effects } : {}),
  };
}

/** Slots a Program takes on a deck, with the Black ICE rule applied. */
export function netProgramSlots(
  profile: Pick<CpredNetProgramProfile, 'slots' | 'blackIce'>,
): number {
  if (typeof profile.slots === 'number' && profile.slots > 0) return profile.slots;
  return profile.blackIce ? NET_BLACK_ICE_SLOTS : 1;
}

// ────────────────────────────── Demony (26c) ──────────────────────────────

/**
 * Net defenders that are not Programs on a deck.
 *
 * Stage 26a only knew Demons; stage 26d adds the three tables of s. 212–216 —
 * and they are three kinds rather than one, because the rulebook gives each
 * table a different set of columns and a different sentence about who may
 * operate it. A drone moves and needs a Demon or a netrunner behind it; an
 * emplacement is bolted down and fights on its own Combat Value; an
 * environmental system can only ever be switched on or off.
 */
export const NET_DEFENSE_KINDS = ['demon', 'drone', 'emplacement', 'environment'] as const;
export type NetDefenseKind = (typeof NET_DEFENSE_KINDS)[number];

export const NET_DEFENSE_KIND_LABELS: Record<NetDefenseKind, string> = {
  demon: 'Demon',
  drone: 'Aktywny system obronny',
  emplacement: 'Stanowisko obronne',
  environment: 'System obrony środowiskowej',
};

/** The three defence-system tables; a Demon is not one of them. */
export const NET_DEFENSE_SYSTEM_KINDS: readonly NetDefenseKind[] = [
  'drone',
  'emplacement',
  'environment',
];

export function isNetDefenseSystem(kind: NetDefenseKind): boolean {
  return NET_DEFENSE_SYSTEM_KINDS.includes(kind);
}

/**
 * A Net defender's numbers. One interface for four kinds, with everything but
 * the kind optional — because the rulebook prints four different sets of
 * columns and half of them are blank in any given row.
 *
 * A **Demon** (s. 212) is not a Black ICE row with different labels: it has a
 * Combat Value instead of ATK/OBR, no PRĘ and no PER (passwords do not stop it,
 * it gets no free attack and Ślizg does not shake it off), and it defends with
 * an Interface Check like a netrunner. Keeping it a separate type is what stops
 * stage 26e from having to special-case a half-filled ICE.
 *
 * A **defence system** (s. 213–216) carries what the three tables print: the DV
 * and the minutes of „Elektronika i zabezpieczenia" that shut it down, its hit
 * points, a drone's MOVE, an emplacement's Combat Value, the Perception DV to
 * notice an environmental one, and the sentence that sets it off.
 */
export interface CpredNetDefenseProfile {
  defenseKind: NetDefenseKind;
  /** Demon only — its Program hit points. */
  rez?: number;
  /** „Interfejs" — Demon only: what it rolls to defend, and how deep it reaches. */
  interfaceRank?: number;
  /** Net Actions per turn; a Demon spends them on control nodes first. */
  netActions?: number;
  /** „Wartość bojowa" — Stat + Skill in one number, for the devices it runs. */
  combatValue?: number;
  /** „PT 17 Elektronika i zabezpieczenia" — shutting it down from the Soma. */
  disableDv?: number;
  /** „5 minut, by unieszkodliwić". */
  disableMinutes?: number;
  /** PW of the system itself: a camera has 5, a gas lift 60. */
  hp?: number;
  /** „RUCH 8" — active systems only. */
  move?: number;
  /** „Percepcja PT 17, by zauważyć" — environmental systems only. */
  spotDv?: number;
  /** „Standardowa aktywacja" — the trigger sentence, as prose. */
  trigger?: string;
  /**
   * What the „Efekt" prose means in numbers (stage 26f). Absent = a system the
   * GM adjudicates: it still stands on the map, still has body points and still
   * shuts down to an Electronics Check, it simply has nothing automatic to hand
   * out. A camera is exactly that row, and always will be.
   */
  effects?: CpredNetDefenseEffects;
  icon?: string;
}

export const NET_DEFENSE_STAT_MAX = 99;
export const NET_DEFENSE_MINUTES_MAX = 240;
export const NET_DEFENSE_TRIGGER_MAX = 300;

// ─────────────── efekt systemu obronnego jako dane (etap 26f) ───────────────

/**
 * *When* a defence system goes off — the machine half of „Standardowa
 * aktywacja".
 *
 * Three values, and the rulebook's own eighteen rows need no more. Almost every
 * one of them says „cel wchodzi na broniony obszar" (`enter`); two ask for
 * movement *inside* it („Każdy, kto wykona Akcję Ruchu na tym obszarze" —
 * Ślizgawka, s. 216; „przemieszcza się o 2 metry wewnątrz" — Siatka laserowa);
 * and exactly one takes a place of its own in the queue and acts on its Turn
 * („Pułapka zajmuje pierwsze miejsce w Kolejce Inicjatywy" — Winda z gazem).
 *
 * The prose stays in `trigger` next to it. This field says what the engine does;
 * that one says what the table reads, and the two are not the same sentence.
 */
export const NET_DEFENSE_TRIGGERS = ['enter', 'move', 'turn'] as const;
export type NetDefenseTrigger = (typeof NET_DEFENSE_TRIGGERS)[number];

export const NET_DEFENSE_TRIGGER_LABELS: Record<NetDefenseTrigger, string> = {
  enter: 'Wejście na broniony obszar',
  move: 'Każdy ruch na bronionym obszarze',
  turn: 'W Turze systemu — własne miejsce w Kolejce Inicjatywy',
};

export function isNetDefenseTrigger(value: unknown): value is NetDefenseTrigger {
  return typeof value === 'string' && (NET_DEFENSE_TRIGGERS as readonly string[]).includes(value);
}

/**
 * The check a defence system forces on whoever it catches.
 *
 * Deliberately the **same shape** stage 16h gave the rounds, minus the failure:
 * what failing costs is spelled out by the fields around it here, because a
 * defence system's failure can go *through armour* („zadając im 6k6 obrażeń
 * w ciało. Pancerz redukuje te obrażenia") while a round's forced failure never
 * does. Sharing the type is what lets `cpredCheckBase` roll both.
 */
export type CpredNetDefenseCheck = Omit<CpredAmmoCheck, 'failure'>;

/**
 * What a defence system actually does, in numbers (stage 26f).
 *
 * Until this stage the eighteen rows of s. 213–216 carried their effect as
 * **prose only** — „zadaje 6k6 obrażeń ciału", „udany Test Atletyki o PT 15 lub
 * Przewróci się", „redukując RUCH o 2k6 punktów" — which is fine for a GM
 * reading a card and useless to a trap that has to go off by itself. This is
 * the same move stage 26c made for Programs (`CpredNetProgramEffects`) and
 * stage 16g made for ammunition: every field is optional, absent means „the
 * system does not do that", and a row with no effects at all is a row the GM
 * adjudicates — a camera, or a drone whose gun is a token on the map.
 *
 * The order the server resolves them in is the order the rulebook writes them:
 * roll the check, and on a failure hand out the damage, the statuses and the
 * wounds together as one undoable card.
 */
export interface CpredNetDefenseEffects {
  /** When it goes off; absent means `enter`, which is what most rows say. */
  when?: NetDefenseTrigger;
  /** The check that avoids it („udany Test Atletyki o PT 15 lub Przewróci się"). */
  check?: CpredNetDefenseCheck;
  /**
   * „Osoba, **która widzi** wiązki laserowe, może przejść przez broniony obszar,
   * wykonując udany Test Umiejętności Człowiek guma o PT 17" (s. 216).
   *
   * The only check in the three tables reserved for somebody who has already
   * noticed the trap — everywhere else the roll is a reflex and comes whether or
   * not you knew. With this flag, a figure whose owner has not spotted the zone
   * simply takes the effect without a roll.
   */
  awareOnly?: boolean;
  /**
   * Damage in dice notation. Dealt to whoever failed the check, or — when there
   * is no check — to everybody the system caught.
   */
  damage?: string;
  /**
   * „obrażenia bezpośrednio w PW" (krwawy rój, s. 215): armour neither stops
   * them nor wears down. Absent means the ordinary damage path of stage 15,
   * where the vest takes its share.
   */
  direct?: boolean;
  /** „Pancerz redukuje te obrażenia i sam nie ulega uszkodzeniu" (s. 216). */
  noAblation?: boolean;
  /** Statuses it puts on („Przewróci się" → Powalony). */
  statuses?: string[];
  /** Critical Injuries it inflicts, by compendium id. */
  injuries?: string[];
  /** Seconds those last; absent means „until somebody takes them off". */
  durationS?: number;
  /**
   * „Nie otrzymują obrażeń dodatkowych z tych Ran Krytycznych" (panele
   * ogłuszające, s. 216) — the wound is written down, the extra 5 is not.
   */
  noBonusDamage?: boolean;
  /**
   * „redukując RUCH o 2k6 punktów, dopóki cel … nie opuści bronionego obszaru"
   * (maź, s. 216). Rolled once when it catches somebody and carried as a status
   * value, exactly like the burning of stage 16g.
   */
  moveDrain?: string;
  /**
   * „Cel otrzymuje ponownie 6k6 obrażeń na koniec swojej kolejnej Tury oraz na
   * koniec każdej kolejnej Tury, chyba że zejdzie z podłogi" (s. 216).
   */
  repeats?: boolean;
  /**
   * An emplacement pulls its own trigger at whoever set it off, „wykonując Test
   * Wartości bojowej + 1k10" (s. 214). The gun is the figure bound to the zone,
   * so this flag says *that it shoots*, never what with.
   */
  fires?: boolean;
}

/** Largest MOVE drain or damage notation a defence row may carry. */
export const NET_DEFENSE_NOTATION_MAX = 16;
/** Most statuses or wounds one system hands out at once. */
export const NET_DEFENSE_EFFECT_LIST_MAX = 4;

function notation(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().slice(0, NET_DEFENSE_NOTATION_MAX);
  return trimmed.length > 0 ? trimmed : undefined;
}

function idList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((value): value is string => typeof value === 'string' && value.length > 0);
  return [...new Set(ids)].slice(0, NET_DEFENSE_EFFECT_LIST_MAX);
}

/**
 * Reads the mechanical half of a defence system's effect, dropping whatever it
 * does not understand — the bargain `readNetProgramEffects` struck in 26c. A row
 * whose effect will not parse is a row the GM rules on, never a refused save.
 */
export function readNetDefenseEffects(raw: unknown): CpredNetDefenseEffects | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const input = raw as Record<string, unknown>;

  let check: CpredNetDefenseCheck | undefined;
  if (typeof input.check === 'object' && input.check !== null) {
    const source = input.check as Record<string, unknown>;
    const dv = typeof source.dv === 'number' && Number.isInteger(source.dv) ? source.dv : undefined;
    const skillId = typeof source.skillId === 'string' ? source.skillId.trim() : '';
    // A check with no DV is not a check; a check with no skill would roll on
    // „will" for reasons nobody wrote down.
    if (dv !== undefined && dv > 0 && skillId.length > 0) {
      check = {
        skillId,
        dv,
        ...(typeof source.skillLabel === 'string' && source.skillLabel.trim().length > 0
          ? { skillLabel: source.skillLabel.trim() }
          : {}),
        ...(typeof source.statId === 'string'
          ? { statId: source.statId as CpredNetDefenseCheck['statId'] }
          : {}),
        ...(source.biologicalOnly === true ? { biologicalOnly: true } : {}),
      };
    }
  }

  const damage = notation(input.damage);
  const moveDrain = notation(input.moveDrain);
  const statuses = idList(input.statuses);
  const injuries = idList(input.injuries);
  const durationS =
    typeof input.durationS === 'number' && Number.isFinite(input.durationS) && input.durationS > 0
      ? Math.round(input.durationS)
      : undefined;

  const effects: CpredNetDefenseEffects = {
    ...(isNetDefenseTrigger(input.when) && input.when !== 'enter' ? { when: input.when } : {}),
    ...(check ? { check } : {}),
    ...(check && input.awareOnly === true ? { awareOnly: true } : {}),
    ...(damage ? { damage } : {}),
    ...(input.direct === true ? { direct: true } : {}),
    ...(input.noAblation === true ? { noAblation: true } : {}),
    ...(statuses.length > 0 ? { statuses } : {}),
    ...(injuries.length > 0 ? { injuries } : {}),
    ...(durationS !== undefined ? { durationS } : {}),
    ...(input.noBonusDamage === true ? { noBonusDamage: true } : {}),
    ...(moveDrain ? { moveDrain } : {}),
    ...(input.repeats === true ? { repeats: true } : {}),
    ...(input.fires === true ? { fires: true } : {}),
  };
  return Object.keys(effects).length > 0 ? effects : undefined;
}

/** When this system goes off, with the default the rulebook uses most often. */
export function netDefenseTrigger(effects: CpredNetDefenseEffects | undefined): NetDefenseTrigger {
  return effects?.when ?? 'enter';
}

/** True when the engine has something to do with this row at all. */
export function netDefenseActs(effects: CpredNetDefenseEffects | undefined): boolean {
  if (!effects) return false;
  return Boolean(
    effects.damage ||
    effects.check ||
    effects.moveDrain ||
    effects.fires ||
    (effects.statuses?.length ?? 0) > 0 ||
    (effects.injuries?.length ?? 0) > 0,
  );
}

/**
 * „Test Atletyki PT 15 · 6k6 w ciało · Powalony · na minutę" — one Polish line
 * for the GM's form and the zone's card.
 *
 * Names rather than ids for the statuses and wounds, so the caller passes the
 * labels it has already looked up — a card reading „injury.head-uraz-oka" would
 * be the compendium leaking into the table's language, the same rule
 * `describeAmmoFailure` follows.
 */
export function describeNetDefenseEffects(
  effects: CpredNetDefenseEffects | undefined,
  labels: { statuses?: readonly string[]; injuries?: readonly string[] } = {},
): string {
  if (!effects) return '';
  const parts: string[] = [];
  if (effects.check) {
    const name = effects.check.skillLabel ?? effects.check.skillId;
    parts.push(
      effects.awareOnly
        ? `Test ${name} PT ${effects.check.dv} (tylko dla tego, kto zauważył)`
        : `Test ${name} PT ${effects.check.dv}`,
    );
  }
  if (effects.damage) {
    parts.push(effects.direct ? `${effects.damage} bezpośrednich` : `${effects.damage} w ciało`);
  }
  if (effects.fires) parts.push('stanowisko strzela Wartością bojową');
  if (effects.moveDrain) parts.push(`RUCH −${effects.moveDrain}`);
  const statuses = labels.statuses ?? effects.statuses ?? [];
  if (statuses.length > 0) parts.push(statuses.join(', '));
  const injuries = labels.injuries ?? effects.injuries ?? [];
  if (injuries.length > 0) parts.push(injuries.join(', '));
  if (effects.repeats) parts.push('powtórnie na koniec każdej Tury');
  if (effects.durationS) parts.push(describeCpredDuration(effects.durationS));
  return parts.join(' · ');
}

// ─────────────────── urządzenia przy węźle kontrolnym (26d) ───────────────────

/**
 * What a control node may be wired to (stage 26d).
 *
 * The kind decides which buttons the run window offers, and nothing else —
 * „kamery, drony, wieżyczki, siatki laserowe, windy, spryskiwacze" (s. 199) is
 * the rulebook's own list and it mixes things that shoot with things that only
 * have a switch. What separates them here is not the compendium entry (a GM may
 * wire anything to anything) but this one field.
 */
export const NET_DEVICE_KINDS = ['camera', 'turret', 'drone', 'door', 'environment'] as const;
export type NetDeviceKind = (typeof NET_DEVICE_KINDS)[number];

export const NET_DEVICE_KIND_LABELS: Record<NetDeviceKind, string> = {
  camera: 'Kamera',
  turret: 'Wieżyczka',
  drone: 'Dron',
  door: 'Drzwi lub winda',
  environment: 'System środowiskowy',
};

export const NET_DEVICE_NAME_MAX = 60;
export const NET_DEVICES_PER_NODE_MAX = 6;

/**
 * One thing hanging off a control node.
 *
 * The binding is an **identifier**, never a copy: `tokenId` points at the figure
 * standing on the map (a turret, a drone), `wallId` at a door or window of stage
 * 18d. A copy would be a second home for the turret's ammunition, and the two
 * would drift apart the first time somebody reloaded it by hand.
 */
export interface CpredNetDevice {
  id: string;
  /** What the table calls it („Kamera nad barem"). */
  name: string;
  deviceKind: NetDeviceKind;
  /** Catalogue row from „Obrona Sieci", when the GM picked one. */
  entryId?: string;
  /** Figure on the scene this device *is* — turrets and drones shoot from it. */
  tokenId?: string;
  /** Door or window of stage 18d this device opens. */
  wallId?: number;
  /** GM's own note; leaves the server only once the node has been taken. */
  notes?: string;
}

// ──────────────────────────── Architektura Sieciowa ────────────────────────────

/** The four difficulty rungs of s. 210 („Poziom Trudności" of the whole build). */
export const NET_DIFFICULTIES = ['basic', 'standard', 'high', 'advanced'] as const;
export type NetDifficulty = (typeof NET_DIFFICULTIES)[number];

export const NET_DIFFICULTY_LABELS: Record<NetDifficulty, string> = {
  basic: 'Podstawowy',
  standard: 'Standardowy',
  high: 'Wysoki',
  advanced: 'Zaawansowany',
};

/** What waits behind the door of one floor (s. 209). */
export const NET_FLOOR_KINDS = [
  'empty',
  'password',
  'file',
  'controlNode',
  'ice',
  'demon',
] as const;
export type NetFloorKind = (typeof NET_FLOOR_KINDS)[number];

export const NET_FLOOR_KIND_LABELS: Record<NetFloorKind, string> = {
  empty: 'Puste',
  password: 'Hasło',
  file: 'Plik',
  controlNode: 'Węzeł kontrolny',
  ice: 'Czarny LOD',
  demon: 'Demon',
};

/** Floors whose challenge is a DV the netrunner rolls against. */
export const NET_FLOOR_KINDS_WITH_DV: readonly NetFloorKind[] = ['password', 'file', 'controlNode'];

/** Floors filled with Programs rather than a DV. */
export const NET_FLOOR_KINDS_WITH_PROGRAMS: readonly NetFloorKind[] = ['ice', 'demon'];

/** Floors that may be wired to things in the real world (stage 26d). */
export const NET_FLOOR_KINDS_WITH_DEVICES: readonly NetFloorKind[] = ['controlNode'];

export const NET_FLOOR_DV_MIN = 1;
export const NET_FLOOR_DV_MAX = 30;
export const NET_FLOORS_MAX = 24;
export const NET_BRANCHES_MAX = 4;
export const NET_FLOOR_PROGRAMS_MAX = 4;
export const NET_ARCHITECTURE_NAME_MAX = 80;
export const NET_FLOOR_LABEL_MAX = 120;
export const NET_NOTES_MAX = 1000;

/**
 * RAW: „Architektura Sieciowa może odgałęziać się dopiero poniżej drugiego
 * piętra głównej gałęzi" (s. 210). Floors are 0-based here, so a branch may
 * hang off index 1 (the second floor) at the earliest.
 */
export const NET_BRANCH_PARENT_MIN = 1;

export interface CpredNetFloor {
  id: string;
  kind: NetFloorKind;
  /** What the players see once they open the door („Plik: listy przewozowe"). */
  label: string;
  /** DV to beat — passwords, Files and control nodes only. */
  dv?: number;
  /** Compendium ids of the Programs waiting here (Black ICE, or a Demon). */
  programIds?: string[];
  /** What this control node is wired to (stage 26d); control nodes only. */
  devices?: CpredNetDevice[];
  /** GM-only note; never leaves the server before the floor is uncovered. */
  notes?: string;
}

/**
 * One column of the shaft. `parentFloor` is null for the trunk; a branch hangs
 * off the trunk floor of that index and its own first floor sits one level
 * below it. RAW only ever branches off the main line, so a branch of a branch
 * is not representable — deliberately.
 */
export interface CpredNetBranch {
  id: string;
  /** Shown at the top of the column; the trunk's is optional. */
  name?: string;
  parentFloor: number | null;
  floors: CpredNetFloor[];
}

export interface CpredNetArchitecture {
  id: string;
  name: string;
  difficulty: NetDifficulty;
  /** The trunk first, then its branches. */
  branches: CpredNetBranch[];
  /** GM's own description of what this thing runs in the real world. */
  notes?: string;
}

export function netTrunk(architecture: CpredNetArchitecture): CpredNetBranch | undefined {
  return architecture.branches.find((branch) => branch.parentFloor === null);
}

/** How deep a branch reaches, counted from the top floor of the architecture. */
export function netBranchDepth(branch: CpredNetBranch): number {
  return (branch.parentFloor === null ? 0 : branch.parentFloor + 1) + branch.floors.length;
}

/** Total floors, whichever column they sit in. */
export function netFloorCount(architecture: CpredNetArchitecture): number {
  return architecture.branches.reduce((total, branch) => total + branch.floors.length, 0);
}

/**
 * The branch a Virus can be left in: „któraś gałąź zawsze musi być najdłuższa,
 * tym samym tworząc wyraźne dno tej Architektury" (s. 210). A tie means there
 * is no bottom, which is why this returns null rather than picking one.
 */
export function netDeepestBranch(architecture: CpredNetArchitecture): CpredNetBranch | null {
  let deepest: CpredNetBranch | null = null;
  let deepestDepth = 0;
  let tied = false;
  for (const branch of architecture.branches) {
    const depth = netBranchDepth(branch);
    if (depth > deepestDepth) {
      deepest = branch;
      deepestDepth = depth;
      tied = false;
    } else if (depth === deepestDepth) {
      tied = true;
    }
  }
  return tied ? null : deepest;
}

/** „Jeden Demon na sześć pięter" (s. 218) — how many this shaft should carry. */
export const NET_FLOORS_PER_DEMON = 6;

/** Floors carrying a Demon, for whoever has to instantiate them (stage 26e). */
export function netDemonFloors(architecture: CpredNetArchitecture): CpredNetFloor[] {
  return architecture.branches
    .flatMap((branch) => branch.floors)
    .filter((floor) => floor.kind === 'demon' && (floor.programIds?.length ?? 0) > 0);
}

/**
 * The rulebook's own budget for Demons, as advice rather than a refusal — the
 * same bargain the rest of `netArchitectureAdvice` makes with every other soft
 * expectation. Null when the shaft is within budget.
 *
 * Lives here rather than in `netdemons.ts` on purpose: that module reads this
 * one, so the arrow may not point back. Counting Demons is a question about the
 * *build*, which is this file's subject anyway.
 */
export function netDemonBudgetAdvice(architecture: CpredNetArchitecture): string | null {
  let floors = 0;
  let demons = 0;
  for (const branch of architecture.branches) {
    for (const floor of branch.floors) {
      floors += 1;
      if (floor.kind === 'demon') demons += floor.programIds?.length ?? 0;
    }
  }
  if (demons === 0) return null;
  const allowed = Math.max(1, Math.floor(floors / NET_FLOORS_PER_DEMON));
  if (demons <= allowed) return null;
  return `Demonów jest ${demons}, a Architektura ma ${floors} pięter — podręcznik radzi jednego Demona na ${NET_FLOORS_PER_DEMON} pięter (s. 218).`;
}

/**
 * Things the rulebook expects that a half-built architecture may not have yet.
 * Advice rather than refusal: the GM is mid-edit, and an editor that refuses to
 * save an architecture with two equally long branches is an editor that eats
 * work. Stage 26b may still refuse to *run* one.
 */
export function netArchitectureAdvice(architecture: CpredNetArchitecture): string[] {
  const advice: string[] = [];
  const trunk = netTrunk(architecture);
  if (!trunk || trunk.floors.length === 0) {
    advice.push('Architektura nie ma ani jednego piętra.');
    return advice;
  }
  // Stage 26e: „jeden Demon na sześć pięter" (s. 218) — a budget, not a rule.
  const demonBudget = netDemonBudgetAdvice(architecture);
  if (demonBudget) advice.push(demonBudget);
  if (netDeepestBranch(architecture) === null) {
    advice.push(
      'Dwie gałęzie sięgają równie głęboko — nie ma wyraźnego dna, w którym można zostawić Wirusa.',
    );
  }
  for (const branch of architecture.branches) {
    const column = branch.parentFloor === null ? 'Trzon' : (branch.name ?? 'Odgałęzienie');
    branch.floors.forEach((floor, index) => {
      if (NET_FLOOR_KINDS_WITH_DV.includes(floor.kind) && floor.dv === undefined) {
        advice.push(`${column}, piętro ${index + 1}: ${NET_FLOOR_KIND_LABELS[floor.kind]} bez PT.`);
      }
      if (NET_FLOOR_KINDS_WITH_PROGRAMS.includes(floor.kind) && !floor.programIds?.length) {
        advice.push(
          `${column}, piętro ${index + 1}: ${NET_FLOOR_KIND_LABELS[floor.kind]} bez wpisu.`,
        );
      }
      // Stage 26d: a control node wired to nothing is a Check with no payout,
      // and a turret with no figure on the map has nothing to shoot from.
      if (floor.kind === 'controlNode' && !floor.devices?.length) {
        advice.push(`${column}, piętro ${index + 1}: węzeł kontrolny bez urządzeń.`);
      }
      for (const device of floor.devices ?? []) {
        if ((device.deviceKind === 'turret' || device.deviceKind === 'drone') && !device.tokenId) {
          advice.push(
            `${column}, piętro ${index + 1}: „${device.name}" nie ma żetonu na scenie — nie będzie czym strzelić.`,
          );
        }
        if (device.deviceKind === 'door' && device.wallId === undefined) {
          advice.push(
            `${column}, piętro ${index + 1}: „${device.name}" nie wskazuje drzwi ani okna.`,
          );
        }
      }
    });
  }
  return advice;
}

export interface CpredNetIssue {
  field: string;
  message: string;
}

// ──────────────────── walidacja efektu Programu (26c) ────────────────────

function diceCount(raw: unknown): number | undefined {
  return typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw > 0 &&
    raw <= NET_PROGRAM_DAMAGE_DICE_MAX
    ? raw
    : undefined;
}

/**
 * Reads the mechanical half of a Program's effect off whatever the editor or
 * the import script produced. Silently drops what it does not understand: an
 * unknown hook is a Program the engine cannot help with, which is the same
 * place a Program with no `effects` at all starts from — never a refused save.
 */
export function readNetProgramEffects(raw: unknown): CpredNetProgramEffects | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const input = raw as Record<string, unknown>;

  const vsProgram = diceCount(input.vsProgram);
  const vsBlackIce = diceCount(input.vsBlackIce);
  const vsBrain = diceCount(input.vsBrain);

  let boost: CpredNetProgramEffects['boost'];
  if (typeof input.boost === 'object' && input.boost !== null) {
    const source = input.boost as Record<string, unknown>;
    const value =
      typeof source.value === 'number' && Number.isInteger(source.value)
        ? Math.max(-NET_PROGRAM_BOOST_MAX, Math.min(NET_PROGRAM_BOOST_MAX, source.value))
        : 0;
    const abilities = (Array.isArray(source.abilities) ? source.abilities : []).filter(
      (value): value is NetAbilityId => typeof value === 'string' && value.length > 0,
    );
    const speed = source.speed === true;
    if (value !== 0 && (abilities.length > 0 || speed)) {
      boost = {
        value,
        ...(abilities.length > 0 ? { abilities } : {}),
        ...(speed ? { speed } : {}),
      };
    }
  }

  let guard: CpredNetProgramEffects['guard'];
  if (typeof input.guard === 'object' && input.guard !== null) {
    const source = input.guard as Record<string, unknown>;
    if ((NET_GUARD_KINDS as readonly unknown[]).includes(source.kind)) {
      const value =
        typeof source.value === 'number' && Number.isInteger(source.value) && source.value > 0
          ? source.value
          : undefined;
      guard = { kind: source.kind as NetGuardKind, ...(value !== undefined ? { value } : {}) };
    }
  }

  const hooks = (Array.isArray(input.hooks) ? input.hooks : []).filter(
    (value): value is NetProgramHook =>
      typeof value === 'string' && (NET_PROGRAM_HOOKS as readonly string[]).includes(value),
  );
  const glue = (NET_GLUE_DURATIONS as readonly unknown[]).includes(input.glue)
    ? (input.glue as NetGlueDuration)
    : undefined;

  const effects: CpredNetProgramEffects = {
    ...(vsProgram !== undefined ? { vsProgram } : {}),
    ...(vsBlackIce !== undefined ? { vsBlackIce } : {}),
    ...(vsBrain !== undefined ? { vsBrain } : {}),
    ...(boost ? { boost } : {}),
    ...(guard ? { guard } : {}),
    ...(hooks.length > 0 ? { hooks: [...new Set(hooks)] } : {}),
    ...(glue && hooks.includes('glue') ? { glue } : {}),
    ...(input.destroys === true ? { destroys: true } : {}),
    ...(input.singleCopy === true ? { singleCopy: true } : {}),
    ...(input.oncePerEntry === true ? { oncePerEntry: true } : {}),
  };
  return Object.keys(effects).length > 0 ? effects : undefined;
}

function isFloorKind(value: unknown): value is NetFloorKind {
  return typeof value === 'string' && (NET_FLOOR_KINDS as readonly string[]).includes(value);
}

export function isNetDifficulty(value: unknown): value is NetDifficulty {
  return typeof value === 'string' && (NET_DIFFICULTIES as readonly string[]).includes(value);
}

function text(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

function floorId(index: number, branchIndex: number, raw: unknown): string {
  const given = typeof raw === 'string' ? raw.trim() : '';
  return given.length > 0 ? given.slice(0, 40) : `f${branchIndex}-${index}`;
}

function validateFloor(
  raw: unknown,
  index: number,
  branchIndex: number,
  issues: CpredNetIssue[],
): CpredNetFloor | undefined {
  if (typeof raw !== 'object' || raw === null) {
    issues.push({ field: `floor.${branchIndex}.${index}`, message: 'Nieprawidłowe piętro.' });
    return undefined;
  }
  const input = raw as Record<string, unknown>;
  const kind = isFloorKind(input.kind) ? input.kind : 'empty';

  let dv: number | undefined;
  if (NET_FLOOR_KINDS_WITH_DV.includes(kind) && input.dv !== undefined && input.dv !== null) {
    const value = input.dv;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < NET_FLOOR_DV_MIN ||
      value > NET_FLOOR_DV_MAX
    ) {
      issues.push({
        field: `floor.${branchIndex}.${index}.dv`,
        message: `PT musi być liczbą całkowitą od ${NET_FLOOR_DV_MIN} do ${NET_FLOOR_DV_MAX}.`,
      });
    } else {
      dv = value;
    }
  }

  const programIds = NET_FLOOR_KINDS_WITH_PROGRAMS.includes(kind)
    ? (Array.isArray(input.programIds) ? input.programIds : [])
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .slice(0, NET_FLOOR_PROGRAMS_MAX)
    : [];

  const devices = NET_FLOOR_KINDS_WITH_DEVICES.includes(kind) ? readNetDevices(input.devices) : [];

  const notes = text(input.notes, NET_NOTES_MAX);
  return {
    id: floorId(index, branchIndex, input.id),
    kind,
    label: text(input.label, NET_FLOOR_LABEL_MAX),
    ...(dv !== undefined ? { dv } : {}),
    ...(programIds.length > 0 ? { programIds } : {}),
    ...(devices.length > 0 ? { devices } : {}),
    ...(notes ? { notes } : {}),
  };
}

/**
 * Reads the device list of a control node off whatever the editor produced.
 *
 * Silently drops what it does not understand rather than refusing the save, for
 * the same reason `readNetProgramEffects` does: the GM is mid-build, and an
 * editor that refuses „Zapisz" because one row has no name is an editor that
 * eats work. A device with no binding is legal and useful — it is a switch the
 * GM narrates.
 */
export function readNetDevices(raw: unknown): CpredNetDevice[] {
  if (!Array.isArray(raw)) return [];
  const devices: CpredNetDevice[] = [];
  for (const entry of raw.slice(0, NET_DEVICES_PER_NODE_MAX)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const input = entry as Record<string, unknown>;
    const deviceKind = (NET_DEVICE_KINDS as readonly unknown[]).includes(input.deviceKind)
      ? (input.deviceKind as NetDeviceKind)
      : undefined;
    if (!deviceKind) continue;
    const name = text(input.name, NET_DEVICE_NAME_MAX);
    if (!name) continue;
    const id =
      typeof input.id === 'string' && input.id ? input.id.slice(0, 40) : `d${devices.length}`;
    const entryId = typeof input.entryId === 'string' && input.entryId ? input.entryId : undefined;
    const tokenId = typeof input.tokenId === 'string' && input.tokenId ? input.tokenId : undefined;
    const wallId =
      typeof input.wallId === 'number' && Number.isInteger(input.wallId) ? input.wallId : undefined;
    const notes = text(input.notes, NET_NOTES_MAX);
    devices.push({
      id,
      name,
      deviceKind,
      ...(entryId ? { entryId } : {}),
      ...(tokenId ? { tokenId } : {}),
      ...(wallId !== undefined ? { wallId } : {}),
      ...(notes ? { notes } : {}),
    });
  }
  return devices;
}

/**
 * Validates an architecture coming from the GM editor. Hard shape only — the
 * soft rulebook expectations are `netArchitectureAdvice`.
 */
export function validateNetArchitecture(
  raw: unknown,
): { ok: true; architecture: CpredNetArchitecture } | { ok: false; issues: CpredNetIssue[] } {
  const issues: CpredNetIssue[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, issues: [{ field: 'architecture', message: 'Nieprawidłowy format.' }] };
  }
  const input = raw as Record<string, unknown>;

  const name = text(input.name, NET_ARCHITECTURE_NAME_MAX);
  if (!name) issues.push({ field: 'name', message: 'Nazwa jest wymagana.' });

  const rawBranches = Array.isArray(input.branches) ? input.branches : [];
  const branches: CpredNetBranch[] = [];
  let floors = 0;
  let trunkFloors = 0;
  let trunkSeen = false;

  rawBranches.slice(0, NET_BRANCHES_MAX + 1).forEach((rawBranch, branchIndex) => {
    if (typeof rawBranch !== 'object' || rawBranch === null) return;
    const branch = rawBranch as Record<string, unknown>;
    const isTrunk = branch.parentFloor === null || branch.parentFloor === undefined;
    if (isTrunk && trunkSeen) {
      issues.push({ field: `branch.${branchIndex}`, message: 'Trzon może być tylko jeden.' });
      return;
    }
    const rawFloors = Array.isArray(branch.floors) ? branch.floors : [];
    const parsed = rawFloors
      .slice(0, NET_FLOORS_MAX)
      .map((floor, index) => validateFloor(floor, index, branchIndex, issues))
      .filter((floor): floor is CpredNetFloor => floor !== undefined);
    floors += parsed.length;

    if (isTrunk) {
      trunkSeen = true;
      trunkFloors = parsed.length;
      branches.unshift({
        id: floorId(branchIndex, 0, branch.id),
        ...(text(branch.name, NET_ARCHITECTURE_NAME_MAX)
          ? { name: text(branch.name, NET_ARCHITECTURE_NAME_MAX) }
          : {}),
        parentFloor: null,
        floors: parsed,
      });
      return;
    }

    const parent = branch.parentFloor;
    if (typeof parent !== 'number' || !Number.isInteger(parent) || parent < NET_BRANCH_PARENT_MIN) {
      issues.push({
        field: `branch.${branchIndex}.parentFloor`,
        message: 'Odgałęzienie może wyrastać najwcześniej z drugiego piętra trzonu.',
      });
      return;
    }
    branches.push({
      id: floorId(branchIndex, 0, branch.id),
      ...(text(branch.name, NET_ARCHITECTURE_NAME_MAX)
        ? { name: text(branch.name, NET_ARCHITECTURE_NAME_MAX) }
        : {}),
      parentFloor: parent,
      floors: parsed,
    });
  });

  if (!trunkSeen) issues.push({ field: 'branches', message: 'Architektura musi mieć trzon.' });
  if (floors > NET_FLOORS_MAX) {
    issues.push({
      field: 'branches',
      message: `Architektura mieści najwyżej ${NET_FLOORS_MAX} pięter.`,
    });
  }
  for (const branch of branches) {
    if (branch.parentFloor !== null && branch.parentFloor >= trunkFloors) {
      issues.push({
        field: 'branches',
        message: 'Odgałęzienie wyrasta z piętra, którego trzon nie ma.',
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  const notes = text(input.notes, NET_NOTES_MAX);
  return {
    ok: true,
    architecture: {
      id: typeof input.id === 'string' && input.id ? input.id : `net.${slugify(name)}`,
      name,
      difficulty: isNetDifficulty(input.difficulty) ? input.difficulty : 'standard',
      branches,
      ...(notes ? { notes } : {}),
    },
  };
}

// ──────────────────────────── dane z pliku (tabele) ────────────────────────────

/** One rung of the Interface -> Net Actions ladder (s. 198). */
export interface CpredNetActionBand {
  min: number;
  max: number;
  actions: number;
}

/** One rung of the architecture difficulty ladder (s. 210). */
export interface CpredNetDifficultyRung {
  id: NetDifficulty;
  dv: number;
  /** Interface rank the rulebook calls „dająca szansę na sukces". */
  suggestedInterface: number;
}

/** What a rolled floor turns out to be — the cells of both rolling tables. */
export interface CpredNetFloorRoll {
  kind: NetFloorKind;
  dv?: number;
  programIds?: string[];
}

export interface CpredNetLobbyRow extends CpredNetFloorRoll {
  /** 1d6. */
  roll: number;
}

export type CpredNetContentRow = { roll: number } & Record<NetDifficulty, CpredNetFloorRoll>;

export interface CpredNetrunningData {
  netActions: CpredNetActionBand[];
  difficulties: CpredNetDifficultyRung[];
  lobbyTable: CpredNetLobbyRow[];
  contentTable: CpredNetContentRow[];
}

export const EMPTY_CPRED_NETRUNNING_DATA: CpredNetrunningData = {
  netActions: [],
  difficulties: [],
  lobbyTable: [],
  contentTable: [],
};

function floorRoll(raw: unknown): CpredNetFloorRoll | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  if (!isFloorKind(input.kind)) return null;
  const programIds = (Array.isArray(input.programIds) ? input.programIds : []).filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return {
    kind: input.kind,
    ...(typeof input.dv === 'number' && Number.isInteger(input.dv) ? { dv: input.dv } : {}),
    ...(programIds.length > 0 ? { programIds } : {}),
  };
}

export function buildNetrunningData(raw: unknown): CpredNetrunningData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;

  const netActions = (Array.isArray(input.netActions) ? input.netActions : [])
    .map((band) => band as Record<string, unknown>)
    .filter(
      (band) =>
        typeof band?.min === 'number' &&
        typeof band?.max === 'number' &&
        typeof band?.actions === 'number',
    )
    .map((band) => ({
      min: band.min as number,
      max: band.max as number,
      actions: band.actions as number,
    }));

  const difficulties = (Array.isArray(input.difficulties) ? input.difficulties : [])
    .map((rung) => rung as Record<string, unknown>)
    .filter((rung) => isNetDifficulty(rung?.id) && typeof rung?.dv === 'number')
    .map((rung) => ({
      id: rung.id as NetDifficulty,
      dv: rung.dv as number,
      suggestedInterface:
        typeof rung.suggestedInterface === 'number' ? (rung.suggestedInterface as number) : 0,
    }));

  const lobbyTable = (Array.isArray(input.lobbyTable) ? input.lobbyTable : [])
    .map((row) => {
      const record = row as Record<string, unknown>;
      const content = floorRoll(row);
      return content && typeof record?.roll === 'number'
        ? { roll: record.roll as number, ...content }
        : null;
    })
    .filter((row): row is CpredNetLobbyRow => row !== null);

  const contentTable = (Array.isArray(input.contentTable) ? input.contentTable : [])
    .map((row) => {
      const record = row as Record<string, unknown>;
      if (typeof record?.roll !== 'number') return null;
      const cells = {} as Record<NetDifficulty, CpredNetFloorRoll>;
      for (const difficulty of NET_DIFFICULTIES) {
        const cell = floorRoll(record[difficulty]);
        if (!cell) return null;
        cells[difficulty] = cell;
      }
      return { roll: record.roll, ...cells } as CpredNetContentRow;
    })
    .filter((row): row is CpredNetContentRow => row !== null);

  if (netActions.length === 0 && lobbyTable.length === 0 && contentTable.length === 0) return null;
  return { netActions, difficulties, lobbyTable, contentTable };
}

export function withNetrunningData(registry: CpredRegistry, raw: unknown): CpredRegistry {
  return { ...registry, netrunning: buildNetrunningData(raw) };
}

/** The registry's netrunning tables, or the empty set that refuses politely. */
export function netrunningDataOf(registry: CpredRegistry): CpredNetrunningData {
  return registry.netrunning ?? EMPTY_CPRED_NETRUNNING_DATA;
}

/**
 * Net Actions this Interface rank buys (s. 198). Outside the ladder's rungs the
 * nearest one wins, so an Interface of 0 still gets the bottom rung's answer
 * rather than none — a netrunner with no rank cannot connect anyway.
 */
export function netActionsForInterface(rank: number, data: CpredNetrunningData): number {
  if (data.netActions.length === 0) return 0;
  const exact = data.netActions.find((band) => rank >= band.min && rank <= band.max);
  if (exact) return exact.actions;
  const sorted = [...data.netActions].sort((a, b) => a.min - b.min);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return 0;
  return rank < first.min ? first.actions : last.actions;
}

export function netDifficultyDv(difficulty: NetDifficulty, data: CpredNetrunningData): number {
  return data.difficulties.find((rung) => rung.id === difficulty)?.dv ?? 0;
}

// ───────────────────────────────── generator ─────────────────────────────────

export interface NetGeneratorOptions {
  name: string;
  difficulty: NetDifficulty;
  /** Skips step 1's shape roll and builds exactly this many floors. */
  floors?: number;
  /** Skips step 1's branch roll: this many branches, no dice. */
  branches?: number;
}

export interface NetGeneratedArchitecture {
  architecture: CpredNetArchitecture;
  /** What the dice said, for the chat line the GM gets. */
  trace: {
    floors: number;
    floorsRolled: boolean;
    branches: number;
    branchesRolled: boolean;
  };
}

const BRANCH_ROLL_MIN = 7;
const LOBBY_FLOORS = 2;
/** Give up rerolling a duplicate rather than loop: RAW has no tie-breaker. */
const REROLL_ATTEMPTS = 6;

function roll(rng: DiceRng, sides: number): number {
  return Math.max(1, Math.min(sides, Math.trunc(rng(sides))));
}

function roll3d6(rng: DiceRng): number {
  return roll(rng, 6) + roll(rng, 6) + roll(rng, 6);
}

/**
 * Steps 1 and 2 of „Tworzenie Architektury Sieciowej" (s. 210).
 *
 * Step 1: 3d6 floors, then 1d10 per branch — a 7 or higher adds one and earns
 * another roll. Step 2: the first two floors come from the Lobby table, the
 * rest from the difficulty's column of the content table.
 *
 * „Przerzucasz hasła i Programy, jeśli już zostały wylosowane" is read here as
 * *the same row* coming up twice, not *any* password coming up twice: the
 * rulebook's own sample architecture (s. 209) carries two passwords, and a
 * category-wide rule would make an eighteen-floor build impossible to fill.
 * Files and control nodes are never rerolled — the sentence does not name them.
 */
export function generateNetArchitecture(
  rng: DiceRng,
  data: CpredNetrunningData,
  options: NetGeneratorOptions,
): NetGeneratedArchitecture {
  const floorsRolled = options.floors === undefined;
  const total = Math.max(
    1,
    Math.min(NET_FLOORS_MAX, floorsRolled ? roll3d6(rng) : (options.floors ?? 0)),
  );

  const branchesRolled = options.branches === undefined;
  let branchCount = 0;
  if (branchesRolled) {
    while (branchCount < NET_BRANCHES_MAX && roll(rng, 10) >= BRANCH_ROLL_MIN) branchCount += 1;
  } else {
    branchCount = Math.max(0, Math.min(NET_BRANCHES_MAX, options.branches ?? 0));
  }
  // A branch needs a trunk floor to hang from and a floor of its own.
  branchCount = Math.min(branchCount, Math.max(0, Math.floor((total - LOBBY_FLOORS - 1) / 2)));

  const perBranch = branchCount > 0 ? Math.floor((total - LOBBY_FLOORS) / (branchCount + 2)) : 0;
  const wanted = Array.from({ length: branchCount }, () => Math.max(1, perBranch));

  /*
   * Placing the branches is where the rulebook's one hard shape rule bites:
   * „któraś gałąź zawsze musi być najdłuższa, tym samym tworząc wyraźne dno".
   * A branch hangs below trunk floor `parentFloor`, so it reaches
   * `parentFloor + 1 + size` — and that has to stay *above* the trunk's own
   * bottom. A branch that cannot fit gives its floors back to the trunk rather
   * than being squeezed in: an architecture with no bottom has nowhere to leave
   * a Virus, which is worse than one branch fewer.
   */
  const plan: { parentFloor: number; size: number }[] = [];
  let trunkFloors = total - wanted.reduce((sum, size) => sum + size, 0);
  wanted.forEach((size, index) => {
    const parentFloor = Math.min(
      NET_BRANCH_PARENT_MIN + index * 2,
      Math.max(NET_BRANCH_PARENT_MIN, trunkFloors - 2),
    );
    const fits = Math.min(size, trunkFloors - 2 - parentFloor);
    if (fits < 1) {
      trunkFloors += size;
      return;
    }
    trunkFloors += size - fits;
    plan.push({ parentFloor, size: fits });
  });

  const usedLobby = new Set<number>();
  const usedContent = new Set<number>();

  const drawLobby = (): CpredNetFloorRoll => {
    if (data.lobbyTable.length === 0) return { kind: 'empty' };
    for (let attempt = 0; attempt < REROLL_ATTEMPTS; attempt += 1) {
      const value = roll(rng, 6);
      const row = data.lobbyTable.find((entry) => entry.roll === value);
      if (!row) continue;
      if (!rerollable(row.kind) || !usedLobby.has(value)) {
        usedLobby.add(value);
        return {
          kind: row.kind,
          ...(row.dv !== undefined ? { dv: row.dv } : {}),
          ...(row.programIds ? { programIds: [...row.programIds] } : {}),
        };
      }
    }
    const fallback = data.lobbyTable[0];
    return fallback
      ? { kind: fallback.kind, ...(fallback.dv !== undefined ? { dv: fallback.dv } : {}) }
      : { kind: 'empty' };
  };

  const drawContent = (): CpredNetFloorRoll => {
    if (data.contentTable.length === 0) return { kind: 'empty' };
    for (let attempt = 0; attempt < REROLL_ATTEMPTS; attempt += 1) {
      const value = roll3d6(rng);
      const row = data.contentTable.find((entry) => entry.roll === value);
      if (!row) continue;
      const cell = row[options.difficulty];
      if (!rerollable(cell.kind) || !usedContent.has(value)) {
        usedContent.add(value);
        return { ...cell, ...(cell.programIds ? { programIds: [...cell.programIds] } : {}) };
      }
    }
    return { kind: 'empty' };
  };

  let index = 0;
  const nextFloor = (): CpredNetFloor => {
    const content = index < LOBBY_FLOORS ? drawLobby() : drawContent();
    index += 1;
    return {
      id: `f${index}`,
      kind: content.kind,
      label: '',
      ...(content.dv !== undefined ? { dv: content.dv } : {}),
      ...(content.programIds ? { programIds: content.programIds } : {}),
    };
  };

  const trunk: CpredNetBranch = {
    id: 'trunk',
    parentFloor: null,
    floors: Array.from({ length: Math.max(1, trunkFloors) }, nextFloor),
  };
  const branches: CpredNetBranch[] = plan.map((entry, branchIndex) => ({
    id: `branch-${branchIndex + 1}`,
    name: `Odgałęzienie ${branchIndex + 1}`,
    parentFloor: entry.parentFloor,
    floors: Array.from({ length: entry.size }, nextFloor),
  }));

  return {
    architecture: {
      id: `net.${slugify(options.name) || 'architektura'}`,
      name: options.name,
      difficulty: options.difficulty,
      branches: [trunk, ...branches],
    },
    trace: {
      floors: total,
      floorsRolled,
      branches: branches.length,
      branchesRolled,
    },
  };
}

function rerollable(kind: NetFloorKind): boolean {
  return kind === 'password' || kind === 'ice' || kind === 'demon';
}
