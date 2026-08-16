/**
 * Walka w Sieci (stage 26c) — Programy, Paf, Ślizg i Czarny LOD.
 *
 * Stage 26b walked the shaft; this file is what waits in it. Four decisions
 * shape everything below, and each of them is a sentence from s. 201–205:
 *
 *  - **One roll, two totals.** „Twój Interfejs + ATK Programu + 1k10 przeciw
 *    Interfejs celu + 1k10 lub OBR Programu + 1k10" (s. 201). Both sides are
 *    rolled in the same moment — unlike the Hold of 14d, nobody may answer
 *    later, because the other side is a Program and Programs do not deliberate.
 *    Ties go to the defender: the rulebook says „większy od".
 *  - **An Aggressor is fired, not kept.** „Są uruchomione przy Ataku, a kiedy
 *    zostaną użyte, wyłączają się automatycznie" (s. 201) — so one Net Action
 *    buys the whole attack, and only Boosters and Defenders ever sit in
 *    `rezzed`. That is also why the Paf example on s. 201 works out: a
 *    netrunner with four Net Actions really can fire three Programs and Paf.
 *  - **The effect is data.** What a Program does to what it hits comes off the
 *    catalogue entry (`CpredNetProgramEffects`), never off its name — a GM who
 *    invents „Kolczatka" gets a Program that fights.
 *  - **Derez is not destruction.** REZ 0 leaves the Program on the deck,
 *    useless until two Net Actions (stop, then run) put it back. Only an effect
 *    that says „zamiast tego zostaje zniszczony" erases it.
 *
 * Everything here is a pure function over the run state; the dice, the sheets
 * and the chat cards are the server's business.
 */

import type {
  CpredNetArchitecture,
  CpredNetProgramProfile,
  NetProgramClass,
  NetProgramHook,
  NetProgramTarget,
} from './netrunning.js';
import type { CpredNetProgramEffects } from './netrunning.js';
import {
  NET_GUARD_ARMOUR_DEFAULT,
  NET_GUARD_KIND_LABELS,
  NET_PROGRAM_HOOKS_MANUAL,
  NET_PROGRAM_HOOK_LABELS,
  netProgramDamageDice,
  netProgramHurts,
} from './netrunning.js';
import type { CpredNetPosition, CpredNetRunState, NetAbilityId } from './netrun.js';
import { netAbility, netChildren, netFloorAt, netParent, netSamePosition } from './netrun.js';

// ───────────────────────────── Programy na deku ─────────────────────────────

/**
 * One running copy of a Program. „Uruchomionego i działającego Programu
 * (zrezowanego) nie można ponownie uruchomić, dopóki nie zostanie zatrzymany.
 * To ograniczenie można obejść, uruchamiając kilka kopii tego samego Programu"
 * (s. 201) — hence a list of copies keyed by deck row, not a set of ids.
 */
export interface CpredNetRezzed {
  /** Unique per copy: two Gumki may run side by side. */
  id: string;
  /** Deck row this copy came from (`CpredNetInstallRow.id`). */
  rowId: string;
  /** Catalogue id, when the row came from one. */
  programId?: string;
  name: string;
  profile: CpredNetProgramProfile;
  rezCurrent: number;
  /** REZ 0: „wciąż działa, ale jest tak pokiereszowany, że stał się bezużyteczny". */
  derezzed: boolean;
}

export const NET_ICE_MODES = ['lurking', 'hunting', 'derezzed', 'destroyed'] as const;
export type NetIceMode = (typeof NET_ICE_MODES)[number];

export const NET_ICE_MODE_LABELS: Record<NetIceMode, string> = {
  lurking: 'czyha',
  hunting: 'ściga',
  derezzed: 'zderezowany',
  destroyed: 'zniszczony',
};

/**
 * One Black ICE the run has bumped into.
 *
 * Lives in the run rather than in the architecture for the reason the whole of
 * 26b's state does: „Odłączenie resetuje obronę danej Architektury Sieciowej"
 * (s. 198). A Kraken beaten down to 4 REZ is beaten down for *this* intrusion;
 * the next netrunner meets it whole.
 */
export interface CpredNetIce {
  id: string;
  /** Floor it was found on — where it goes back to lurking after a Ślizg. */
  floorId: string;
  programId: string;
  name: string;
  profile: CpredNetProgramProfile;
  rezCurrent: number;
  mode: NetIceMode;
  /** True once the detection contest of s. 205 has been rolled for it. */
  detected: boolean;
  /** Tracker row carrying its Turn, while a fight is running. */
  combatantId?: string;
  /** Round of its last attack — „atakuje wyznaczony cel raz na Turę". */
  lastAttackRound?: number;
}

/** „Przez 1k6 Rund … nie może zejść … ani bezpiecznie się odłączyć" (s. 204). */
export interface CpredNetGlue {
  /** Program that stuck them. */
  source: string;
  /** Round it lets go on; null outside combat, where rounds do not turn. */
  untilRound: number | null;
}

/** Everything stage 26c adds to a run, with the empty state of a fresh one. */
export interface CpredNetCombatState {
  rezzed: CpredNetRezzed[];
  /** Deck rows whose „raz na wejście do Architektury" is already spent. */
  spentRows: string[];
  ice: CpredNetIce[];
  /** Round of the last Ślizg — „próbę Ślizgu można podjąć tylko raz na Turę". */
  slideRound: number | null;
  glue: CpredNetGlue | null;
  /** Net Actions the next bundle loses („Mózgoklep", „Błędny ognik"). */
  netActionDebt: number;
  /** Skunks that have marked this netrunner: −2 to Ślizg each. */
  slideMarks: string[];
}

export function freshNetCombat(): CpredNetCombatState {
  return {
    rezzed: [],
    spentRows: [],
    ice: [],
    slideRound: null,
    glue: null,
    netActionDebt: 0,
    slideMarks: [],
  };
}

/** „Do minimum 2" (s. 204) — the floor Mózgoklep may not push a netrunner past. */
export const NET_ACTIONS_FLOOR = 2;

/** Net Actions this bundle really opens with, after what was stolen from it. */
export function netActionsAfterDebt(max: number, debt: number): number {
  if (debt <= 0) return max;
  return Math.max(Math.min(max, NET_ACTIONS_FLOOR), max - debt);
}

// ──────────────────────────── premie Dopalaczy ────────────────────────────

/** One named bonus, ready for a roll's breakdown. */
export interface NetBonus {
  label: string;
  value: number;
}

function activeRezzed(state: CpredNetCombatState): CpredNetRezzed[] {
  return state.rezzed.filter((copy) => !copy.derezzed);
}

/**
 * „+2 do Testów Maskowania, dopóki ten Program jest zrezowany" (s. 203).
 *
 * Copies stack — „uruchamiając kilka kopii tego samego Programu jednocześnie,
 * co także sprawi, że ich efekty będą się kumulować" — so this sums rather
 * than taking the best one.
 */
export function netAbilityBonuses(state: CpredNetCombatState, ability: NetAbilityId): NetBonus[] {
  return activeRezzed(state)
    .filter((copy) => copy.profile.effects?.boost?.abilities?.includes(ability))
    .map((copy) => ({ label: copy.name, value: copy.profile.effects!.boost!.value }));
}

/** „Zwiększa twoją Prędkość o +2" — what the detection contest of s. 205 adds. */
export function netSpeedBonuses(state: CpredNetCombatState): NetBonus[] {
  return activeRezzed(state)
    .filter((copy) => copy.profile.effects?.boost?.speed)
    .map((copy) => ({ label: copy.name, value: copy.profile.effects!.boost!.value }));
}

export function netBonusTotal(bonuses: readonly NetBonus[]): number {
  return bonuses.reduce((sum, bonus) => sum + bonus.value, 0);
}

// ──────────────────────────── Obrońcy ────────────────────────────

/** „Obniża obrażenia zadane mózgowi o 4, dopóki jest zrezowany" (s. 203). */
export function netBrainArmour(state: CpredNetCombatState): NetBonus[] {
  return activeRezzed(state)
    .filter((copy) => copy.profile.effects?.guard?.kind === 'armour')
    .map((copy) => ({
      label: copy.name,
      value: copy.profile.effects?.guard?.value ?? NET_GUARD_ARMOUR_DEFAULT,
    }));
}

/**
 * „Zrezowany redukuje do 0 ATK atakujących cię Programów typu Agresor,
 * niebędących Czarnym LOD-em" (s. 203).
 *
 * Nothing in 26c can trigger it: the only attackers in the Net so far are Black
 * ICE, which the sentence excludes by name. It is written now because the rule
 * belongs to the Defender that carries it, and because the enemy netrunner it
 * waits for is one stage away.
 */
export function netShellActive(state: CpredNetCombatState): boolean {
  return activeRezzed(state).some((copy) => copy.profile.effects?.guard?.kind === 'shell');
}

/**
 * „Sprawia, że pierwszy udany atak Programu niebędącego Czarnym LOD-em nie
 * zadaje żadnych obrażeń. Po sparowaniu tych obrażeń, Tarcza derezuje się."
 * Returns the copy that would parry, or null.
 */
export function netShieldFor(
  state: CpredNetCombatState,
  attacker: Pick<CpredNetProgramProfile, 'blackIce'>,
): CpredNetRezzed | null {
  if (attacker.blackIce) return null;
  return activeRezzed(state).find((copy) => copy.profile.effects?.guard?.kind === 'shield') ?? null;
}

// ──────────────────────────── uruchamianie Programów ────────────────────────────

export type NetProgramProblem =
  | 'NET_PROGRAM_UNKNOWN'
  | 'NET_PROGRAM_NOT_LOADED'
  | 'NET_PROGRAM_ALREADY_REZZED'
  | 'NET_PROGRAM_SINGLE_COPY'
  | 'NET_PROGRAM_SPENT'
  | 'NET_PROGRAM_NOT_RUNNING'
  | 'NET_PROGRAM_IS_ATTACKER'
  | 'NET_PROGRAM_NO_EFFECT'
  | 'NET_PROGRAM_WRONG_TARGET';

/**
 * May this deck row be run? Boosters and Defenders only — an Aggressor is not
 * kept running, it is fired (see the header), so „Uruchom" on one is a mistake
 * worth naming rather than a Net Action quietly spent.
 */
export function netCanRunProgram(
  state: CpredNetCombatState,
  row: { id: string; name: string; profile?: CpredNetProgramProfile },
): { ok: true } | { ok: false; problem: NetProgramProblem } {
  const profile = row.profile;
  if (!profile) return { ok: false, problem: 'NET_PROGRAM_UNKNOWN' };
  if (profile.programClass === 'attacker') return { ok: false, problem: 'NET_PROGRAM_IS_ATTACKER' };
  if (state.spentRows.includes(row.id)) return { ok: false, problem: 'NET_PROGRAM_SPENT' };
  if (state.rezzed.some((copy) => copy.rowId === row.id)) {
    return { ok: false, problem: 'NET_PROGRAM_ALREADY_REZZED' };
  }
  if (profile.effects?.singleCopy) {
    const twin = state.rezzed.find(
      (copy) => copy.name === row.name || (copy.programId && copy.programId === row.id),
    );
    if (twin) return { ok: false, problem: 'NET_PROGRAM_SINGLE_COPY' };
  }
  return { ok: true };
}

/** Runs a copy: full REZ, and „raz na wejście" booked if the entry says so. */
export function netRunProgram(
  state: CpredNetCombatState,
  copy: CpredNetRezzed,
): CpredNetCombatState {
  return {
    ...state,
    rezzed: [...state.rezzed, copy],
    spentRows: copy.profile.effects?.oncePerEntry
      ? [...new Set([...state.spentRows, copy.rowId])]
      : state.spentRows,
  };
}

/** Stops a copy. A derezzed one stops too — that is half of putting it back. */
export function netStopProgram(state: CpredNetCombatState, copyId: string): CpredNetCombatState {
  return { ...state, rezzed: state.rezzed.filter((copy) => copy.id !== copyId) };
}

// ──────────────────────────── walka: rzuty i obrażenia ────────────────────────────

/** Who is being shot at, in the only terms the damage table understands. */
export type NetTargetKind = 'program' | 'blackIce' | 'brain';

/**
 * „Program, którego Klasa wskazuje na rodzaj celu … zadaje obrażenia tylko
 * celom odpowiedniego rodzaju" (s. 201). Read off `target`, never off the name.
 */
export function netTargetAllowed(
  profile: Pick<CpredNetProgramProfile, 'target'>,
  target: NetTargetKind,
): boolean {
  if (!profile.target) return true;
  return profile.target === 'antiProgram'
    ? target === 'program' || target === 'blackIce'
    : target === 'brain';
}

/** Sides of one exchange, before the dice. */
export interface NetAttackPlan {
  /** Flat modifiers of the attacker's `1k10 + …`. */
  attack: NetBonus[];
  /** Flat modifiers of the defender's `1k10 + …`. */
  defence: NetBonus[];
  /** k6 the effect deals if it lands; 0 for effects that are not damage. */
  dice: number;
  label: string;
}

/**
 * The netrunner firing an Aggressor: „Twój Interfejs + ATK Programu + 1k10
 * przeciw … OBR Programu/Czarnego LOD-u + 1k10" (s. 201).
 */
export function netProgramAttackPlan(input: {
  interfaceRank: number;
  program: { name: string; profile: CpredNetProgramProfile };
  target: { name: string; profile: CpredNetProgramProfile; kind: NetTargetKind };
}): NetAttackPlan {
  const { interfaceRank, program, target } = input;
  return {
    attack: [
      { label: `Interfejs ${interfaceRank}`, value: interfaceRank },
      ...(program.profile.atk !== 0
        ? [{ label: `ATK ${program.name}`, value: program.profile.atk }]
        : []),
    ],
    defence:
      target.profile.def !== 0 ? [{ label: `OBR ${target.name}`, value: target.profile.def }] : [],
    dice: netProgramDamageDice(program.profile, target.kind),
    label: `${program.name} → ${target.name}`,
  };
}

/** „Paf … zadajesz 1k6 obrażeń Programowi lub mózgowi Netrunnera" (s. 201). */
export const NET_ZAP_DAMAGE_DICE = 1;

export function netZapPlan(input: {
  interfaceRank: number;
  target: { name: string; profile: CpredNetProgramProfile };
}): NetAttackPlan {
  return {
    attack: [{ label: `Interfejs ${input.interfaceRank}`, value: input.interfaceRank }],
    defence:
      input.target.profile.def !== 0
        ? [{ label: `OBR ${input.target.name}`, value: input.target.profile.def }]
        : [],
    dice: NET_ZAP_DAMAGE_DICE,
    label: `Paf → ${input.target.name}`,
  };
}

/**
 * The Black ICE's own Turn: „rzucając na ATK + 1k10 przeciw Interfejs + 1k10
 * Netrunnera (lub OBR + 1k10 Programu w przypadku LOD-u przeciwprogramowego)"
 * (s. 205). Note what is missing on the attacking side — an ICE has no
 * Interface to add.
 */
export function netIceAttackPlan(input: {
  ice: CpredNetIce;
  defender:
    | { kind: 'brain'; name: string; interfaceRank: number }
    | { kind: 'program'; name: string; profile: CpredNetProgramProfile };
}): NetAttackPlan {
  const { ice, defender } = input;
  const target: NetTargetKind = defender.kind === 'brain' ? 'brain' : 'program';
  return {
    attack: ice.profile.atk !== 0 ? [{ label: `ATK ${ice.name}`, value: ice.profile.atk }] : [],
    defence:
      defender.kind === 'brain'
        ? [{ label: `Interfejs ${defender.interfaceRank}`, value: defender.interfaceRank }]
        : defender.profile.def !== 0
          ? [{ label: `OBR ${defender.name}`, value: defender.profile.def }]
          : [],
    dice: netProgramDamageDice(ice.profile, target),
    label: `${ice.name} → ${defender.name}`,
  };
}

/**
 * The free attack of s. 205: „rzucasz na Interfejs + suma aktywnych premii do
 * PRĘDKOŚCI + 1k10 przeciw PRĘDKOŚCI + 1k10 tego Czarnego LOD-u".
 *
 * The odd one out among the rolls here: the netrunner is the one rolling, and
 * losing is what costs them. So the plan is built from the *netrunner's* side
 * and `won` means „the ICE did not get its free hit".
 */
export function netDetectionPlan(input: {
  interfaceRank: number;
  speedBonuses: readonly NetBonus[];
  ice: CpredNetIce;
}): NetAttackPlan {
  return {
    attack: [
      { label: `Interfejs ${input.interfaceRank}`, value: input.interfaceRank },
      ...input.speedBonuses,
    ],
    defence:
      input.ice.profile.speed !== undefined && input.ice.profile.speed !== 0
        ? [{ label: `PRĘ ${input.ice.name}`, value: input.ice.profile.speed }]
        : [],
    dice: 0,
    label: `Wykrycie — ${input.ice.name}`,
  };
}

/** „Jeśli uda ci się Test Ślizgu przeciw rzutowi Percepcji + 1k10" (s. 200). */
export function netSlidePlan(input: {
  interfaceRank: number;
  marks: number;
  ice: CpredNetIce;
}): NetAttackPlan {
  return {
    attack: [
      { label: `Interfejs ${input.interfaceRank}`, value: input.interfaceRank },
      ...(input.marks > 0 ? [{ label: `Skunks ×${input.marks}`, value: -2 * input.marks }] : []),
    ],
    defence:
      input.ice.profile.per !== undefined && input.ice.profile.per !== 0
        ? [{ label: `PER ${input.ice.name}`, value: input.ice.profile.per }]
        : [],
    dice: 0,
    label: `Ślizg — ${input.ice.name}`,
  };
}

/** „Większy od" — the attacker has to beat the defender, a tie is a miss. */
export function netAttackWins(attackTotal: number, defenceTotal: number): boolean {
  return attackTotal > defenceTotal;
}

// ──────────────────────────── obrażenia Programów ────────────────────────────

export interface NetRezOutcome {
  before: number;
  after: number;
  /** REZ reached 0 with this hit. */
  derezzed: boolean;
  /** „Zamiast tego zostaje zniszczony" — erased, not merely useless. */
  destroyed: boolean;
}

/** Takes `damage` off a REZ pool and says what became of the Program. */
export function netApplyRez(
  rezCurrent: number,
  damage: number,
  destroys: boolean | undefined,
): NetRezOutcome {
  const before = Math.max(0, rezCurrent);
  const after = Math.max(0, before - Math.max(0, damage));
  const down = after === 0 && before > 0;
  return {
    before,
    after,
    derezzed: down && !destroys,
    destroyed: down && destroys === true,
  };
}

/** The ICE list after a hit — derez and destruction are both terminal here. */
export function netDamageIce(
  state: CpredNetCombatState,
  iceId: string,
  damage: number,
  destroys?: boolean,
): { state: CpredNetCombatState; outcome: NetRezOutcome | null } {
  const target = state.ice.find((entry) => entry.id === iceId);
  if (!target) return { state, outcome: null };
  const outcome = netApplyRez(target.rezCurrent, damage, destroys);
  const mode: NetIceMode = outcome.destroyed
    ? 'destroyed'
    : outcome.derezzed
      ? 'derezzed'
      : target.mode;
  return {
    state: {
      ...state,
      ice: state.ice.map((entry) =>
        entry.id === iceId ? { ...entry, rezCurrent: outcome.after, mode } : entry,
      ),
    },
    outcome,
  };
}

/** The same for one of the netrunner's own running copies. */
export function netDamageRezzed(
  state: CpredNetCombatState,
  copyId: string,
  damage: number,
  destroys?: boolean,
): { state: CpredNetCombatState; outcome: NetRezOutcome | null } {
  const target = state.rezzed.find((copy) => copy.id === copyId);
  if (!target) return { state, outcome: null };
  const outcome = netApplyRez(target.rezCurrent, damage, destroys);
  const rezzed = outcome.destroyed
    ? state.rezzed.filter((copy) => copy.id !== copyId)
    : state.rezzed.map((copy) =>
        copy.id === copyId
          ? { ...copy, rezCurrent: outcome.after, derezzed: copy.derezzed || outcome.derezzed }
          : copy,
      );
  return { state: { ...state, rezzed }, outcome };
}

// ──────────────────────────── Czarny LOD w akcji ────────────────────────────

/** ICE still able to act: neither derezzed nor erased. */
export function netLiveIce(state: CpredNetCombatState): CpredNetIce[] {
  return state.ice.filter((entry) => entry.mode === 'lurking' || entry.mode === 'hunting');
}

/**
 * The bill an emergency jack-out runs up (s. 198, and the Olbrzym's own text):
 * „odczuwa efekty wszystkich zrezowanych LOD-ów, które napotkał do tej pory
 * w tej Architekturze". Everything still running, in the order it was met.
 *
 * `except` is the Olbrzym's exception — the ICE that did the throwing does not
 * also charge for the landing.
 */
export function netJackOutBill(state: CpredNetCombatState, except?: string): CpredNetIce[] {
  return netLiveIce(state).filter((entry) => entry.id !== except);
}

/**
 * Where a successful Ślizg lands: „uciekasz na sąsiednie piętro windy, ale nie
 * możesz minąć hasła ani innej przeszkody sieciowej" (s. 200).
 *
 * Up is always open — a password blocks the way *down*, and the netrunner came
 * from up there. Down is open only when the floor being fled is not a password
 * that is still standing.
 */
export function netSlideDestinations(
  architecture: CpredNetArchitecture,
  position: CpredNetPosition,
  broken: readonly string[],
): CpredNetPosition[] {
  const destinations: CpredNetPosition[] = [];
  const up = netParent(architecture, position);
  if (up) destinations.push(up);
  const here = netFloorAt(architecture, position);
  const stuck = here?.kind === 'password' && !broken.includes(here.id);
  // A password floor one level down is itself a legal landing spot — it has to
  // be, or nobody could ever Backdoor it. What it stops is everything past it,
  // and that is one move further than a Ślizg reaches anyway.
  if (!stuck) destinations.push(...netChildren(architecture, position));
  return destinations.filter((step) => !netSamePosition(step, position));
}

/** „Próbę Ślizgu można podjąć tylko raz na Turę" — null round = outside combat. */
export function netCanSlide(state: CpredNetCombatState, round: number | null): boolean {
  if (round === null) return true;
  return state.slideRound !== round;
}

/** The glue of Superklej and Kraken, if it is still holding in this round. */
export function netGlueHolds(state: CpredNetCombatState, round: number | null): boolean {
  const glue = state.glue;
  if (!glue) return false;
  if (glue.untilRound === null || round === null) return true;
  return round <= glue.untilRound;
}

/**
 * Is this move a descent? Glue stops going *down* and stops a clean jack-out,
 * and nothing else — „choć wciąż może wykonać awaryjne odłączenie" (s. 204).
 */
export function netMoveGoesDeeper(
  architecture: CpredNetArchitecture,
  from: CpredNetPosition,
  to: CpredNetPosition,
): boolean {
  const depth = (position: CpredNetPosition): number => {
    let steps = 0;
    let cursor: CpredNetPosition | null = position;
    let guard = 0;
    while (cursor && guard < 64) {
      cursor = netParent(architecture, cursor);
      if (cursor) steps += 1;
      guard += 1;
    }
    return steps;
  };
  return depth(to) > depth(from);
}

// ──────────────────────────── efekty, które coś robią ────────────────────────────

/** One consequence of a landed effect, ready for the card and for the server. */
export interface NetEffectOutcome {
  hook: NetProgramHook;
  label: string;
  /** True when the engine applied it; false when the line is for the GM. */
  applied: boolean;
}

export function netHookIsManual(hook: NetProgramHook): boolean {
  return NET_PROGRAM_HOOKS_MANUAL.includes(hook);
}

/** A random running Defender — what Kruk derezzes when it lands (s. 205). */
export function netRandomDefender(
  state: CpredNetCombatState,
  pick: (count: number) => number,
): CpredNetRezzed | null {
  const defenders = activeRezzed(state).filter((copy) => copy.profile.programClass === 'defender');
  if (defenders.length === 0) return null;
  const index = Math.min(defenders.length - 1, Math.max(0, Math.trunc(pick(defenders.length)) - 1));
  return defenders[index] ?? null;
}

/**
 * A random Program on the deck — Żmija's „niszczy jeden losowy Program
 * zainstalowany na cyberdeku celu" (s. 205). Black ICE rows are left alone:
 * Trujący zgon says so in as many words, and Żmija's own table row means the
 * same catalogue of loadable Programs.
 */
export function netRandomDeckProgram<T extends { id: string; profile?: CpredNetProgramProfile }>(
  rows: readonly T[],
  pick: (count: number) => number,
): T | null {
  const candidates = rows.filter((row) => row.profile && !row.profile.blackIce);
  if (candidates.length === 0) return null;
  const index = Math.min(
    candidates.length - 1,
    Math.max(0, Math.trunc(pick(candidates.length)) - 1),
  );
  return candidates[index] ?? null;
}

/** „Jeden z twoich losowo określonych uruchomionych Programów" (s. 205). */
export function netRandomRezzed(
  state: CpredNetCombatState,
  pick: (count: number) => number,
): CpredNetRezzed | null {
  const running = activeRezzed(state);
  if (running.length === 0) return null;
  const index = Math.min(running.length - 1, Math.max(0, Math.trunc(pick(running.length)) - 1));
  return running[index] ?? null;
}

/**
 * „3k6 Czarnym LOD-om · −1 Akcja Sieciowa" — the effect in one line.
 *
 * Lives here rather than beside the type it describes because a Booster names
 * the Interface ability it helps, and those names are `netrun.ts`'s — which
 * imports the catalogue, so the catalogue may not import them back.
 */
export function describeNetProgramEffects(effects: CpredNetProgramEffects | undefined): string {
  if (!effects) return '';
  const parts: string[] = [];
  if (effects.vsProgram) parts.push(`${effects.vsProgram}k6 Programom`);
  if (effects.vsBlackIce && effects.vsBlackIce !== effects.vsProgram) {
    parts.push(`${effects.vsBlackIce}k6 Czarnym LOD-om`);
  }
  if (effects.vsBrain) parts.push(`${effects.vsBrain}k6 w mózg`);
  if (effects.boost) {
    const named = (effects.boost.abilities ?? [])
      .map((id) => netAbility(id)?.name)
      .filter((name): name is string => Boolean(name));
    const where = effects.boost.speed
      ? 'do Prędkości'
      : named.length > 0
        ? `do Testów: ${named.join(', ')}`
        : 'do Testów';
    parts.push(`${effects.boost.value > 0 ? '+' : ''}${effects.boost.value} ${where}`);
  }
  if (effects.guard) {
    parts.push(NET_GUARD_KIND_LABELS[effects.guard.kind].split(' — ')[1] ?? '');
  }
  for (const hook of effects.hooks ?? []) parts.push(NET_PROGRAM_HOOK_LABELS[hook]);
  if (effects.destroys) parts.push('niszczy zamiast derezować');
  return parts.filter(Boolean).join(' · ');
}

// ──────────────────────────── widok dla klienta ────────────────────────────

/** One deck slot as the run window paints it. */
export interface NetProgramSlotView {
  rowId: string;
  name: string;
  programClass: NetProgramClass;
  blackIce?: boolean;
  target?: NetProgramTarget;
  atk: number;
  def: number;
  rez: number;
  /** „3k6 Programom · −1 Akcja Sieciowa" — the effect in one line. */
  effect: string;
  /**
   * Dice this row would throw at a Black ICE, 0 when it has nothing to say to
   * one. Precomputed here so the window can grey out „Atakuj" honestly instead
   * of re-deriving the target rules from the effect sentence.
   */
  vsIce: number;
  /**
   * The same figure for an ordinary Program — which is what a Demon is (stage
   * 26e). Two numbers rather than one, because the rulebook prints two damage
   * columns and a Miecz really does hit a Demon harder than a Kraken.
   */
  vsProgram: number;
  icon?: string;
  /** Set while a copy of this row is running. */
  rezzedId?: string;
  rezCurrent?: number;
  derezzed?: boolean;
  /** „Raz na wejście do Architektury" already spent. */
  spent?: boolean;
}

/**
 * One Black ICE as one pair of eyes may see it.
 *
 * The netrunner gets the name, the icon and the REZ bar — the fight is about
 * that bar, and hiding it would make choosing a target a coin toss. ATK, OBR,
 * PER and PRĘ stay with the GM: those are the numbers the rules make the
 * netrunner discover by rolling against them. The effect text unlocks once the
 * thing has actually shown what it does.
 */
export interface NetIceView {
  id: string;
  name: string;
  floorId: string;
  icon?: string;
  rezCurrent: number;
  rezMax: number;
  mode: NetIceMode;
  detected: boolean;
  /** True when it stands on the floor the netrunner is on. */
  here: boolean;
  target?: NetProgramTarget;
  effect?: string;
  atk?: number;
  def?: number;
  per?: number;
  speed?: number;
}

export interface NetCombatView {
  deck: NetProgramSlotView[];
  ice: NetIceView[];
  glue: CpredNetGlue | null;
  netActionDebt: number;
  /** Skunks marks — each one is −2 on the next Ślizg. */
  slideMarks: number;
  slideRound: number | null;
  /** What the Defenders take off the next hit in the brain. */
  brainArmour: number;
  /**
   * Where a successful Ślizg may land right now. Sent rather than derived at
   * the client, because deriving it needs the whole shaft — and choosing the
   * floor is the tactical half of the ability („uciekasz na sąsiednie piętro",
   * s. 200), so a window that always fled upwards would be half the rule.
   */
  slideTargets: { position: CpredNetPosition; label: string }[];
}

/** One row of a cyberdeck, in the little the view needs of it. */
export interface NetDeckRow {
  id: string;
  name: string;
  profile?: CpredNetProgramProfile;
}

export function netCombatView(
  state: CpredNetCombatState,
  input: {
    deck: readonly NetDeckRow[];
    gm: boolean;
    currentFloorId: string | null;
    describeEffect: (profile: CpredNetProgramProfile) => string;
    slideTargets?: { position: CpredNetPosition; label: string }[];
  },
): NetCombatView {
  const deck: NetProgramSlotView[] = input.deck
    .filter((row) => row.profile)
    .map((row) => {
      const profile = row.profile!;
      const copy = state.rezzed.find((entry) => entry.rowId === row.id);
      return {
        rowId: row.id,
        name: row.name,
        programClass: profile.programClass,
        ...(profile.blackIce ? { blackIce: true } : {}),
        ...(profile.target ? { target: profile.target } : {}),
        atk: profile.atk,
        def: profile.def,
        rez: profile.rez,
        effect: input.describeEffect(profile),
        vsIce:
          netTargetAllowed(profile, 'blackIce') && netProgramHurts(profile, 'blackIce')
            ? netProgramDamageDice(profile, 'blackIce')
            : 0,
        vsProgram:
          netTargetAllowed(profile, 'program') && netProgramHurts(profile, 'program')
            ? netProgramDamageDice(profile, 'program')
            : 0,
        ...(profile.icon ? { icon: profile.icon } : {}),
        ...(copy
          ? { rezzedId: copy.id, rezCurrent: copy.rezCurrent, derezzed: copy.derezzed }
          : {}),
        ...(state.spentRows.includes(row.id) ? { spent: true } : {}),
      };
    });

  const ice: NetIceView[] = state.ice.map((entry) => ({
    id: entry.id,
    name: entry.name,
    floorId: entry.floorId,
    ...(entry.profile.icon ? { icon: entry.profile.icon } : {}),
    rezCurrent: entry.rezCurrent,
    rezMax: entry.profile.rez,
    mode: entry.mode,
    detected: entry.detected,
    here: input.currentFloorId !== null && entry.floorId === input.currentFloorId,
    ...(entry.profile.target ? { target: entry.profile.target } : {}),
    ...(input.gm || entry.detected ? { effect: input.describeEffect(entry.profile) } : {}),
    ...(input.gm
      ? {
          atk: entry.profile.atk,
          def: entry.profile.def,
          ...(entry.profile.per !== undefined ? { per: entry.profile.per } : {}),
          ...(entry.profile.speed !== undefined ? { speed: entry.profile.speed } : {}),
        }
      : {}),
  }));

  return {
    deck,
    ice,
    glue: state.glue,
    netActionDebt: state.netActionDebt,
    slideMarks: state.slideMarks.length,
    slideRound: state.slideRound,
    brainArmour: netBonusTotal(netBrainArmour(state)),
    slideTargets: input.slideTargets ?? [],
  };
}

// ──────────────────────────── odczyt stanu ────────────────────────────

function readProfile(raw: unknown): CpredNetProgramProfile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.programClass !== 'string') return null;
  return input as unknown as CpredNetProgramProfile;
}

function readRezzed(raw: unknown): CpredNetRezzed[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => entry as Record<string, unknown>)
    .map((entry) => {
      const profile = readProfile(entry?.profile);
      if (!profile || typeof entry.id !== 'string' || typeof entry.rowId !== 'string') return null;
      return {
        id: entry.id,
        rowId: entry.rowId,
        ...(typeof entry.programId === 'string' ? { programId: entry.programId } : {}),
        name: typeof entry.name === 'string' ? entry.name : 'Program',
        profile,
        rezCurrent: Number.isInteger(entry.rezCurrent) ? (entry.rezCurrent as number) : 0,
        derezzed: entry.derezzed === true,
      } satisfies CpredNetRezzed;
    })
    .filter((entry): entry is CpredNetRezzed => entry !== null);
}

function readIce(raw: unknown): CpredNetIce[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => entry as Record<string, unknown>)
    .map((entry) => {
      const profile = readProfile(entry?.profile);
      if (!profile || typeof entry.id !== 'string' || typeof entry.floorId !== 'string')
        return null;
      const mode = (NET_ICE_MODES as readonly unknown[]).includes(entry.mode)
        ? (entry.mode as NetIceMode)
        : 'lurking';
      return {
        id: entry.id,
        floorId: entry.floorId,
        programId: typeof entry.programId === 'string' ? entry.programId : '',
        name: typeof entry.name === 'string' ? entry.name : 'Czarny LOD',
        profile,
        rezCurrent: Number.isInteger(entry.rezCurrent) ? (entry.rezCurrent as number) : 0,
        mode,
        detected: entry.detected === true,
        ...(typeof entry.combatantId === 'string' ? { combatantId: entry.combatantId } : {}),
        ...(Number.isInteger(entry.lastAttackRound)
          ? { lastAttackRound: entry.lastAttackRound as number }
          : {}),
      } satisfies CpredNetIce;
    })
    .filter((entry): entry is CpredNetIce => entry !== null);
}

/** Reads 26c's half of a stored run. Never throws: a broken row is a fresh fight. */
export function readNetCombatState(raw: unknown): CpredNetCombatState {
  if (typeof raw !== 'object' || raw === null) return freshNetCombat();
  const input = raw as Record<string, unknown>;
  const glueRaw = input.glue as Record<string, unknown> | null | undefined;
  const glue: CpredNetGlue | null =
    glueRaw && typeof glueRaw.source === 'string'
      ? {
          source: glueRaw.source,
          untilRound: Number.isInteger(glueRaw.untilRound) ? (glueRaw.untilRound as number) : null,
        }
      : null;
  return {
    rezzed: readRezzed(input.rezzed),
    spentRows: Array.isArray(input.spentRows)
      ? input.spentRows.filter((value): value is string => typeof value === 'string')
      : [],
    ice: readIce(input.ice),
    slideRound: Number.isInteger(input.slideRound) ? (input.slideRound as number) : null,
    glue,
    netActionDebt: Number.isInteger(input.netActionDebt)
      ? Math.max(0, input.netActionDebt as number)
      : 0,
    slideMarks: Array.isArray(input.slideMarks)
      ? input.slideMarks.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

// ──────────────────────────── odmowy po polsku ────────────────────────────

export const NET_COMBAT_PROBLEM_MESSAGES: Record<NetProgramProblem, string> = {
  NET_PROGRAM_UNKNOWN: 'Nie znam tego Programu — brakuje mu danych w kompendium.',
  NET_PROGRAM_NOT_LOADED: 'Tego Programu nie ma w gniazdach twojego cyberdeku.',
  NET_PROGRAM_ALREADY_REZZED:
    'Ta kopia już działa. Żeby uruchomić ją znowu, najpierw ją zatrzymaj.',
  NET_PROGRAM_SINGLE_COPY: 'Tego Programu można uruchomić tylko jedną kopię naraz.',
  NET_PROGRAM_SPENT:
    'Tej kopii można użyć tylko raz na wejście do Architektury — trzeba się odłączyć i wrócić.',
  NET_PROGRAM_NOT_RUNNING: 'Ten Program nie jest uruchomiony.',
  NET_PROGRAM_IS_ATTACKER:
    'Agresora się nie trzyma uruchomionego — odpala się go atakiem i sam się wyłącza.',
  NET_PROGRAM_NO_EFFECT: 'Ten Program nie ma czym zaszkodzić temu celowi.',
  NET_PROGRAM_WRONG_TARGET: 'Klasa tego Programu nie pasuje do rodzaju celu.',
};

/** Everything 26c can refuse, in the shape 26b's client already understands. */
export type NetCombatProblem =
  | NetProgramProblem
  | 'NET_ICE_UNKNOWN'
  | 'NET_ICE_DOWN'
  | 'NET_ICE_ELSEWHERE'
  | 'NET_ICE_ALREADY_DETECTED'
  | 'NET_ICE_NOT_DETECTED'
  | 'NET_ICE_ALREADY_ACTED'
  | 'NET_SLIDE_USED'
  | 'NET_SLIDE_NO_ROOM'
  | 'NET_NO_ICE_HERE'
  | 'NET_GLUED';

export const NET_COMBAT_MESSAGES: Record<NetCombatProblem, string> = {
  ...NET_COMBAT_PROBLEM_MESSAGES,
  NET_ICE_UNKNOWN: 'Nie ma tu takiego Czarnego LOD-u.',
  NET_ICE_DOWN: 'Ten Czarny LOD jest już zderezowany.',
  NET_ICE_ELSEWHERE: 'Ten Czarny LOD jest na innym piętrze.',
  NET_ICE_ALREADY_DETECTED: 'Ten Czarny LOD już cię wykrył.',
  NET_ICE_NOT_DETECTED: 'Ten Czarny LOD czyha — jeszcze nikogo nie dopadł.',
  NET_ICE_ALREADY_ACTED: 'Ten Czarny LOD atakował już w tej Rundzie.',
  NET_SLIDE_USED: 'Ślizg wychodzi raz na Turę — kolejny dopiero w następnej.',
  NET_SLIDE_NO_ROOM: 'Nie ma dokąd uciec — sąsiednie piętra są zablokowane.',
  NET_NO_ICE_HERE: 'Na tym piętrze nie ma Czarnego LOD-u.',
  NET_GLUED: 'Superklej trzyma — ani niżej, ani bezpiecznego odłączenia.',
};

/** A run carrying both halves of its state — what the server passes around. */
export type CpredNetFullRun = CpredNetRunState & CpredNetCombatState;
