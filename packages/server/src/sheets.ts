import type {
  CompendiumEntry,
  CpredChokeOutcome,
  CpredCharacterData,
  CpredCombatProfile,
  CpredCriticalInjuryRow,
  CpredHitLocation,
  CpredAmmoProfile,
  CpredPeriodicDamage,
  CpredRegistry,
  CpredTurnCarryInput,
  CpredTurnProblem,
  CpredTurnSpend,
  CpredWoundState,
  DamageLogEntry,
  DiceRng,
  RollBreakdownEntry,
  TokenHp,
  TurnBudgetView,
} from '@vtt/shared';
import {
  CPRED_ACTIONS,
  CPRED_FIRE_INTENSITIES,
  CPRED_GRAPPLED_STATUS_ID,
  CPRED_GRAPPLE_PENALTY,
  CPRED_GRAPPLE_PENALTY_LABEL,
  CPRED_HIT_LOCATIONS,
  CPRED_ON_FIRE_STATUS_ID,
  CPRED_PRONE_STATUS_ID,
  CPRED_STAT_LABELS,
  CPRED_STATIST_GRAPPLE_DV,
  CPRED_SUPPRESSED_STATUS_ID,
  CPRED_TURN_PROBLEM_MESSAGES,
  CPRED_UNCONSCIOUS_STATUS_ID,
  CPRED_WOUND_LABELS,
  STATIST_WEAPON_ROW_ID,
  ammoAblation,
  ammoDamageNotes,
  applyWoundStatuses,
  combatProfileSheetForSkill,
  cpredAction,
  cpredActionBlock,
  cpredDodgeBlock,
  cpredExpiringStatuses,
  cpredGrappleBase,
  cpredHumanShieldCovers,
  cpredInjuryCarryOnDraw,
  cpredInjuryDodgeBlock,
  cpredInjuryModifiers,
  cpredInjuryTurnEnd,
  cpredMetresLeft,
  cpredMoveBudgetFromSheet,
  cpredMoveRefusal,
  cpredMovementBlock,
  cpredPassiveGrappleDv,
  cpredPeriodicDamage,
  cpredStatusHasDialableDamage,
  cpredTurnBlockReason,
  cpredTurnPhaseRan,
  cpredTurnBudget,
  cpredTurnReminders,
  setCpredHardTerrain,
  withCpredMoveAllowance,
  drawCriticalInjury,
  effectiveArmor,
  forceCpredTurn,
  freshCpredTurn,
  hitLocationLabel,
  hpMax,
  isCriticalInjuryEntry,
  markCpredTurnPhase,
  mergeCharacterData,
  nextCpredChokeStreak,
  parseCharacterData,
  parseCombatProfile,
  passiveEvasionDv,
  readCpredTurn,
  readCpredTurnLedger,
  resolveCpredChoke,
  resolveCpredDamage,
  resolveCpredGrappleTest,
  resolveCpredThrow,
  sanitizeCombatProfile,
  spendCpredTurn,
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

/* ------------------------------------------------------------------ *
 * Turn budget (stage 14b). The tracker knows „a turn started, give me a
 * fresh budget" and „somebody wants to spend this — is that legal?".
 * What a Move Action is, how many attacks an LA 2 weapon fits into one
 * Action and why aiming eats the whole thing all stay behind this seam.
 * ------------------------------------------------------------------ */

/** The system's turn state, serialized for the `Combatant.turnState` column. */
export type SheetTurnState = string;

/** What a participant is trying to spend — the system names the vocabulary. */
export type SheetTurnSpend = CpredTurnSpend;

/** Machine-readable refusal, re-emitted as a realtime error code. */
export type SheetTurnProblem = CpredTurnProblem;

/** One entry of the system's action catalogue, as the UI lists it. */
export interface SheetActionEntry {
  id: string;
  name: string;
  cost: 'action' | 'move' | 'free';
  hint: string;
  /**
   * Resolved by a path of its own (attacks, reloading, stabilizing, holding),
   * so the generic „wykonaj akcję" button must not offer it.
   */
  handledElsewhere: boolean;
}

/** Actions the „Walka" tab may offer as plain buttons. */
export function sheetActionCatalogue(): SheetActionEntry[] {
  return CPRED_ACTIONS.map((action) => ({
    id: action.id,
    name: action.name,
    cost: action.cost,
    hint: action.hint,
    handledElsewhere: action.handledElsewhere === true,
  }));
}

/** Polish name of a catalogued action; the id itself when it is unknown. */
export function sheetActionName(actionId: string): string {
  return cpredAction(actionId)?.name ?? actionId;
}

/** True when the action reserves the Action rather than spending it. */
export function sheetActionReserves(actionId: string): boolean {
  return cpredAction(actionId)?.reserves === true;
}

/**
 * Does this spend claim the turn's Action? The tracker needs the answer to
 * know when a reserved („wstrzymana") Action has finally been used up.
 */
export function spendUsesAction(spend: SheetTurnSpend): boolean {
  if (spend.kind === 'move') return false;
  if (spend.kind === 'attack') return true;
  return cpredAction(spend.actionId)?.cost === 'action';
}

/**
 * What the core needs to know about one participant's movement (stage 14c).
 * The tracker only ever asks „how far may this one go, and why that far" —
 * that RUCH × 2 is metres, that armor weighs and that a broken leg costs 4
 * stays on this side of the seam.
 */
export interface SheetMoveBudget {
  /** Distance one Move Action buys, in the unit the system measures in. */
  metresPerMove: number;
  /** „Pancerz −2 · Złamana noga −4" — shown next to the metres, never guessed. */
  note: string | null;
}

/** Movement allowance of a linked sheet: effective RUCH × 2, and what shrank it. */
export function readSheetMoveBudget(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
): SheetMoveBudget {
  const data = parseCharacterData(character.data, registry);
  const budget = cpredMoveBudgetFromSheet({
    move: data.stats.move,
    hpCurrent: data.hpCurrent,
    hpMax: hpMax(data.stats),
    armor: data.armor,
    injuries: data.criticalInjuries,
  });
  const note = budget.modifiers
    .map(({ label, value }) => `${label} ${value > 0 ? '+' : '−'}${Math.abs(value)}`)
    .join(' · ');
  return {
    metresPerMove: budget.metresPerMove,
    note: note.length > 0 ? `${note}${budget.floored ? ' (RUCH minimum 1)' : ''}` : null,
  };
}

/**
 * Statuses that stop a token walking off on its own — the answer is a ready
 * Polish sentence, because „grappled" means nothing to the person being told
 * their drag was refused.
 */
export function sheetMovementBlock(statuses: readonly string[]): string | null {
  return cpredMovementBlock(statuses);
}

/** The same, for spending an Action at all — Nieprzytomny and Martwy (14d). */
export function sheetActionBlock(statuses: readonly string[]): string | null {
  return cpredActionBlock(statuses);
}

/**
 * The same, for a dodge. A reaction, so being Held does not stop it — but a
 * missing leg does, and that lives on the sheet rather than on the token
 * (stage 14e), so both sources are asked here in one call.
 */
export function sheetDodgeBlock(
  statuses: readonly string[],
  injuries: readonly CpredCriticalInjuryRow[] = [],
): string | null {
  return cpredDodgeBlock(statuses) ?? cpredInjuryDodgeBlock(injuries);
}

/** Status the „Wstanie" Action takes off the token that paid for it. */
export const SHEET_PRONE_STATUS_ID = CPRED_PRONE_STATUS_ID;

/* ------------------------------------------------------------------ *
 * Grappling (stage 14d). The tracker owns „who is holding whom"; every
 * question about what that *costs* is answered here.
 * ------------------------------------------------------------------ */

/** Status a Held participant wears while the relation lasts. */
export const SHEET_GRAPPLED_STATUS_ID = CPRED_GRAPPLED_STATUS_ID;

/** Status a choked-out participant gets. */
export const SHEET_UNCONSCIOUS_STATUS_ID = CPRED_UNCONSCIOUS_STATUS_ID;

/** Flat modifier a Hold imposes on both sides — used to shift stand-in DVs. */
export const SHEET_GRAPPLE_PENALTY = CPRED_GRAPPLE_PENALTY;

/**
 * The named modifiers a participant's situation adds to every roll they make.
 * A list rather than a number so the chat card can say „Trzymanie −2" instead
 * of quietly moving the total (stage 14d decision) — and from stage 14e the
 * Critical Injuries that carry a flat penalty join the same list under their
 * own names („Wstrząśnienie mózgu −2").
 */
export function sheetSituationModifiers(situation: {
  grappled: boolean;
  injuries?: readonly CpredCriticalInjuryRow[];
}): RollBreakdownEntry[] {
  const entries: RollBreakdownEntry[] = [];
  if (situation.grappled) {
    entries.push({
      label: CPRED_GRAPPLE_PENALTY_LABEL,
      value: CPRED_GRAPPLE_PENALTY,
      kind: 'situational',
    });
  }
  for (const modifier of cpredInjuryModifiers(situation.injuries ?? [])) {
    entries.push({ label: modifier.label, value: modifier.value, kind: 'situational' });
  }
  return entries;
}

/** Critical Injuries a sheet carries — the input the modifiers above want. */
export function readSheetInjuries(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
): CpredCriticalInjuryRow[] {
  return parseCharacterData(character.data, registry).criticalInjuries;
}

/** Which side of a Hold an action needs, or undefined when it needs none. */
export function sheetActionRequiresGrapple(actionId: string): 'attacker' | 'defender' | undefined {
  return cpredAction(actionId)?.requiresGrapple;
}

/** ZW + Bijatyka of a sheet — the fixed half of the opposed test. */
export function readSheetGrappleBase(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
): number {
  return cpredGrappleBase(parseCharacterData(character.data, registry), registry);
}

/** Stand-in DV of a defender who has not rolled: ZW + Bijatyka + half a die. */
export function readSheetGrappleDv(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
  modifier = 0,
): number {
  return cpredPassiveGrappleDv(parseCharacterData(character.data, registry), registry, modifier);
}

/** DV of a target with no sheet — the statist default. */
export const SHEET_STATIST_GRAPPLE_DV = CPRED_STATIST_GRAPPLE_DV;

/* ------------------------------------------------------------------ *
 * The statist's combat profile (stage 16b). Everything on the other
 * side of this seam works on `CpredCharacterData`; a statist has a
 * dozen numbers instead. Rather than teaching the attack and damage
 * paths what a statist is, the profile is dressed as a sheet here —
 * see `systems/cpred/statist.ts` for why that is the cheap direction.
 * ------------------------------------------------------------------ */

/** The system's profile shape, as it sits in `Token.combatProfile`. */
export type SheetCombatProfile = CpredCombatProfile;

/** Reads the token's column; null for a token nobody has statted. */
export function readSheetCombatProfile(raw: string | null): SheetCombatProfile | null {
  return parseCombatProfile(raw);
}

/** Repairs whatever a client sent before it is stored. Never rejects. */
export function sheetCombatProfile(raw: unknown): SheetCombatProfile {
  return sanitizeCombatProfile(raw);
}

/**
 * The profile seen as a character sheet, with one skill filled in at the
 * profile's level — the skill this particular roll is made with.
 */
export function sheetFromCombatProfile(
  profile: SheetCombatProfile,
  hp: TokenHp,
  skillId: string | null,
): CpredCharacterData {
  return combatProfileSheetForSkill(profile, hp, skillId);
}

/** Stand-in DV a statist defends with: its own DEX + Unik + half a die. */
export function sheetCombatProfileEvasionDv(
  profile: SheetCombatProfile,
  registry: SheetRegistry,
  hp: TokenHp,
): number {
  return passiveEvasionDv(sheetFromCombatProfile(profile, hp, null), registry);
}

/** The single weapon row id a synthesised statist sheet carries. */
export const SHEET_STATIST_WEAPON_ROW_ID = STATIST_WEAPON_ROW_ID;

/** BODY of a sheet: the damage Duszenie and Rzut deal, flat and undiced. */
export function readSheetBody(character: Pick<Character, 'data'>, registry: SheetRegistry): number {
  return parseCharacterData(character.data, registry).stats.body;
}

/** Who wins an opposed grapple test — ties go to the defender. */
export function judgeSheetGrapple(
  attackerTotal: number,
  defenderTotal: number,
): { won: boolean; margin: number } {
  return resolveCpredGrappleTest(attackerTotal, defenderTotal);
}

/** Does a Ludzka tarcza stop this attack? */
export function sheetHumanShieldCovers(attack: { melee: boolean; aimedAtHead: boolean }): boolean {
  return cpredHumanShieldCovers(attack);
}

/** Rounds in a row after one more squeeze (or 1, when the streak was broken). */
export function nextSheetChokeStreak(
  previousRound: number | null,
  round: number,
  streak: number,
): number {
  return nextCpredChokeStreak(previousRound, round, streak);
}

/** What Duszenie or Rzut did — the shape the caller writes back and logs. */
export interface SheetGrappleDamage {
  /** Serialized sheet payload; absent when the target had no sheet. */
  data?: string;
  hp: TokenHp;
  log: SheetDamageLog;
  /** The squeeze knocked them out — the caller adds the status. */
  unconscious: boolean;
}

function grappleDamageLog(
  outcome: {
    damage: number;
    hpBefore: number;
    hpAfter: number;
    hpLost: number;
    woundBefore: CpredWoundState;
    woundAfter: CpredWoundState;
  },
  hpMaxValue: number,
): SheetDamageLog {
  return {
    location: 'body',
    locationLabel: hitLocationLabel('body'),
    damageRolled: outcome.damage,
    // Armor is not merely beaten here: it is not consulted, and it does not
    // ablate („ignoruje pancerz Broniącego i nie uszkadza go", s. 177).
    armorSp: 0,
    damageThrough: outcome.hpLost,
    doubled: false,
    bonusDamage: 0,
    hpLost: outcome.hpLost,
    hp: { before: outcome.hpBefore, after: outcome.hpAfter, max: hpMaxValue },
    ...(outcome.woundBefore !== outcome.woundAfter
      ? {
          woundLabel: `${CPRED_WOUND_LABELS[outcome.woundBefore]} → ${
            CPRED_WOUND_LABELS[outcome.woundAfter]
          }`,
        }
      : {}),
  };
}

/**
 * Duszenie or Rzut against a sheet. Both deal the Attacker's BODY straight to
 * Hit Points; the choke additionally refuses to take a target with more than
 * 1 HP below zero, parking them at 1 and unconscious instead.
 */
export function applyGrappleDamageToSheet(
  character: Character,
  registry: SheetRegistry,
  request: { body: number; kind: 'choke' | 'throw'; roundsInARow?: number },
): SheetGrappleDamage {
  const data = parseCharacterData(character.data, registry);
  const max = hpMax(data.stats);
  const input = { body: request.body, hpCurrent: data.hpCurrent, hpMax: max };
  const outcome =
    request.kind === 'choke'
      ? resolveCpredChoke({ ...input, roundsInARow: request.roundsInARow ?? 1 })
      : resolveCpredThrow(input);
  const merged = mergeCharacterData(data, { hpCurrent: outcome.hpAfter });
  return {
    data: JSON.stringify(merged),
    hp: { current: merged.hpCurrent, max },
    log: grappleDamageLog(outcome, max),
    unconscious: request.kind === 'choke' && (outcome as CpredChokeOutcome).unconscious,
  };
}

/**
 * Periodic damage against a sheet (stage 14e): fire, poison, drowning and the
 * ribs that re-open when their owner runs.
 *
 * The same „straight into Hit Points" path Duszenie uses, with two rules the
 * caller must not be able to forget: armor neither stops it nor ablates from
 * it, and „obrażenia okresowe nie wywołują Ran Krytycznych" (s. 181) — so no
 * injury table is ever consulted, whatever the number was.
 */
export function applyPeriodicDamageToSheet(
  character: Character,
  registry: SheetRegistry,
  damage: number,
): { data: string; hp: TokenHp; log: SheetDamageLog } {
  const data = parseCharacterData(character.data, registry);
  const max = hpMax(data.stats);
  const outcome = resolveCpredDamage({
    damage,
    location: 'body',
    armorSp: 0,
    hpCurrent: data.hpCurrent,
    hpMax: max,
    criticalInjury: false,
    ignoreArmor: true,
  });
  const merged = mergeCharacterData(data, { hpCurrent: outcome.hpAfter });
  return {
    data: JSON.stringify(merged),
    hp: { current: merged.hpCurrent, max },
    log: periodicDamageLog(outcome, max),
  };
}

/** The same against a statist token that only carries its own HP pair. */
export function applyPeriodicDamageToTokenHp(
  hp: TokenHp,
  damage: number,
): { hp: TokenHp; log: SheetDamageLog } {
  const outcome = resolveCpredDamage({
    damage,
    location: 'body',
    armorSp: 0,
    hpCurrent: hp.current,
    hpMax: hp.max,
    criticalInjury: false,
    ignoreArmor: true,
  });
  return { hp: { current: outcome.hpAfter, max: hp.max }, log: periodicDamageLog(outcome, hp.max) };
}

function periodicDamageLog(
  outcome: ReturnType<typeof resolveCpredDamage>,
  hpMaxValue: number,
): SheetDamageLog {
  return {
    location: 'body',
    locationLabel: hitLocationLabel('body'),
    damageRolled: outcome.damageRolled,
    armorSp: 0,
    damageThrough: outcome.damageThrough,
    doubled: false,
    bonusDamage: 0,
    hpLost: outcome.hpLost,
    hp: { before: outcome.hpBefore, after: outcome.hpAfter, max: hpMaxValue },
    ...(woundTransitionLabel(outcome) ? { woundLabel: woundTransitionLabel(outcome)! } : {}),
  };
}

/** The same against a statist token that only carries its own HP pair. */
export function applyGrappleDamageToTokenHp(
  hp: TokenHp,
  request: { body: number; kind: 'choke' | 'throw'; roundsInARow?: number },
): SheetGrappleDamage {
  const input = { body: request.body, hpCurrent: hp.current, hpMax: hp.max };
  const outcome =
    request.kind === 'choke'
      ? resolveCpredChoke({ ...input, roundsInARow: request.roundsInARow ?? 1 })
      : resolveCpredThrow(input);
  return {
    hp: { current: outcome.hpAfter, max: hp.max },
    log: grappleDamageLog(outcome, hp.max),
    unconscious: request.kind === 'choke' && (outcome as CpredChokeOutcome).unconscious,
  };
}

/* ------------------------------------------------------------------ *
 * Turn automation (stage 14e). The tracker knows „a turn is ending" and
 * „a turn is beginning"; what happens then — who burns, who drowns, who
 * owes the next turn its Action — is all on this side of the seam.
 * ------------------------------------------------------------------ */

/** Numbers riding along with a token's statuses (fire intensity, poison). */
export type SheetStatusData = Record<string, number>;

/**
 * Reads the `Token.statusData` column into the flat map the rules want.
 *
 * Stored as `{"on-fire":{"damage":6}}` rather than `{"on-fire":6}` so a later
 * stage can put a second number on a status (rounds left, a source) without a
 * migration; the rules only ever ask for the damage.
 */
export function readSheetStatusData(raw: string | null | undefined): SheetStatusData {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const values: SheetStatusData = {};
    for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const damage = (entry as { damage?: unknown }).damage;
      if (typeof damage === 'number' && Number.isFinite(damage)) {
        values[id] = Math.max(0, Math.round(damage));
      }
    }
    return values;
  } catch {
    return {};
  }
}

/** Writes one status's number back, or clears it when `damage` is null. */
export function writeSheetStatusData(
  raw: string | null | undefined,
  statusId: string,
  damage: number | null,
): string {
  const values = readSheetStatusData(raw);
  if (damage === null) delete values[statusId];
  else values[statusId] = Math.max(0, Math.round(damage));
  return JSON.stringify(
    Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { damage: value }])),
  );
}

/** Statuses whose damage the GM may dial, and the rungs offered for fire. */
export const SHEET_FIRE_INTENSITIES = CPRED_FIRE_INTENSITIES;

export function sheetStatusHasDialableDamage(statusId: string): boolean {
  return cpredStatusHasDialableDamage(statusId);
}

/** Status the „Ugaszenie" Action takes off the token that paid for it. */
export const SHEET_ON_FIRE_STATUS_ID = CPRED_ON_FIRE_STATUS_ID;

/** Status suppressive fire leaves on whoever failed its WILL check. */
export const SHEET_SUPPRESSED_STATUS_ID = CPRED_SUPPRESSED_STATUS_ID;

/** One line of damage a status owes right now. */
export type SheetPeriodicDamage = CpredPeriodicDamage;

/** What this token owes in this phase of its own turn. */
export function sheetPeriodicDamage(
  statuses: readonly string[],
  phase: 'turn-start' | 'turn-end',
  input: { values?: SheetStatusData; body?: number } = {},
): SheetPeriodicDamage[] {
  return cpredPeriodicDamage(statuses, phase, input);
}

/** Statuses that come off by themselves when their carrier's turn ends. */
export function sheetExpiringStatuses(statuses: readonly string[]): string[] {
  return cpredExpiringStatuses(statuses);
}

/** Nudges for the participant whose turn just began; never a refusal. */
export function sheetTurnReminders(statuses: readonly string[]): string[] {
  return cpredTurnReminders(statuses);
}

/** Debts a turn hands to the next one, as the tracker stores them. */
export type SheetTurnCarry = CpredTurnCarryInput;

/** True when the carry is worth persisting at all. */
export function sheetCarryIsEmpty(carry: SheetTurnCarry | null): boolean {
  return !carry || (!carry.noAction && !carry.noMove);
}

/** Merges two debts — a spine injury on top of an ear, both owed at once. */
export function mergeSheetCarry(
  first: SheetTurnCarry | null,
  second: SheetTurnCarry | null,
): SheetTurnCarry | null {
  const merged: SheetTurnCarry = {
    ...(first?.noAction || second?.noAction
      ? { noAction: first?.noAction ?? second?.noAction }
      : {}),
    ...(first?.noMove || second?.noMove ? { noMove: first?.noMove ?? second?.noMove } : {}),
  };
  return sheetCarryIsEmpty(merged) ? null : merged;
}

/** Reads a stored carry back; anything unreadable is simply no debt. */
export function readSheetCarry(raw: string | null | undefined): SheetTurnCarry | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed as { noAction?: unknown; noMove?: unknown };
    const carry: SheetTurnCarry = {
      ...(typeof value.noAction === 'string' ? { noAction: value.noAction } : {}),
      ...(typeof value.noMove === 'string' ? { noMove: value.noMove } : {}),
    };
    return sheetCarryIsEmpty(carry) ? null : carry;
  } catch {
    return null;
  }
}

/** The debt a wound creates the moment it is drawn („Uraz kręgosłupa"). */
export function sheetInjuryCarryOnDraw(injury: {
  name: string;
  noActionNextTurn?: boolean;
}): SheetTurnCarry | null {
  return cpredInjuryCarryOnDraw(injury);
}

/** What a Critical Injury owes at the end of a turn spent walking. */
export function sheetInjuryTurnEnd(
  injuries: readonly CpredCriticalInjuryRow[],
  metresWalked: number,
): { carry: SheetTurnCarry | null; damage: SheetPeriodicDamage[] } {
  const result = cpredInjuryTurnEnd(injuries, metresWalked);
  return {
    carry: sheetCarryIsEmpty(result.carry) ? null : result.carry,
    damage: result.damage,
  };
}

/** Ground this turn actually covered — what „ponad 4 m" is measured against. */
export function turnMetresWalked(stored: string | null): number {
  return readCpredTurn(stored ?? undefined).metresWalked;
}

/** The two moments a turn hands control to the game system. */
export type SheetTurnPhase = 'turn-start' | 'turn-end';

/** True when this phase already ran for this participant in this round. */
export function turnPhaseAlreadyRan(
  stored: string | null,
  phase: SheetTurnPhase,
  round: number,
): boolean {
  return cpredTurnPhaseRan(readCpredTurnLedger(stored ?? undefined), phase, round);
}

/** Records that this phase has now run, for the ledger column to keep. */
export function markTurnPhase(stored: string | null, phase: SheetTurnPhase, round: number): string {
  return JSON.stringify(markCpredTurnPhase(readCpredTurnLedger(stored ?? undefined), phase, round));
}

/**
 * A budget with everything still unspent — the start of a participant's turn.
 * The distance allowance is baked in at that moment; a spend may hand in a
 * fresher one, which is how a leg broken mid-turn shortens the rest of it.
 *
 * `carry` is what the previous turn (or a wound that landed since) left owing:
 * a turn can begin already missing its Action.
 */
export function freshTurnState(
  move?: SheetMoveBudget | null,
  carry?: SheetTurnCarry | null,
): SheetTurnState {
  return JSON.stringify(
    freshCpredTurn(
      move ? { metresPerMove: move.metresPerMove, note: move.note } : null,
      carry ?? null,
    ),
  );
}

/**
 * Re-reads a participant's allowance onto the budget they are already holding.
 * Called just before a move is judged, so the sheet as it is *now* decides how
 * far they get — not the sheet as it was when their turn began.
 */
export function applyMoveBudget(
  stored: string | null,
  move: SheetMoveBudget | null,
): SheetTurnState {
  const state = withCpredMoveAllowance(
    readCpredTurn(stored ?? undefined),
    move ? { metresPerMove: move.metresPerMove, note: move.note } : null,
  );
  return JSON.stringify(state);
}

/** Records the mover's „ruch utrudniony" declaration on a stored budget. */
export function setTurnHardTerrain(stored: string | null, hard: boolean): SheetTurnState {
  return JSON.stringify(setCpredHardTerrain(readCpredTurn(stored ?? undefined), hard));
}

/** Distance still available on a stored budget; null when it is not measured. */
export function turnDistanceLeft(stored: string | null): number | null {
  return cpredMetresLeft(readCpredTurn(stored ?? undefined));
}

/** Why a path of this length does not fit — in the unit the players speak in. */
export function turnDistanceRefusal(stored: string | null, metres: number): string {
  return cpredMoveRefusal(readCpredTurn(stored ?? undefined), metres);
}

/**
 * Judges one spend. `force` is the GM's freedom: their own NPC is never
 * blocked, but the overspend is counted and shows in the tracker.
 */
export function spendTurnState(
  stored: string | null,
  spend: SheetTurnSpend,
  force: boolean,
):
  | { ok: true; state: SheetTurnState; forced: boolean }
  | { ok: false; error: SheetTurnProblem; message?: string } {
  const current = readCpredTurn(stored ?? undefined);
  const attempt = spendCpredTurn(current, spend);
  if (attempt.ok) return { ok: true, state: JSON.stringify(attempt.state), forced: false };
  if (!force) {
    // A refusal that came from a wound arrives with the wound's own sentence:
    // „ACTION_BLOCKED" tells the player nothing about which rib it was.
    const reason = cpredTurnBlockReason(current, attempt.error);
    return { ok: false, error: attempt.error, ...(reason ? { message: reason } : {}) };
  }
  return { ok: true, state: JSON.stringify(forceCpredTurn(current, spend)), forced: true };
}

/** Human-readable reason a spend was refused. */
export function turnProblemMessage(problem: SheetTurnProblem): string {
  return CPRED_TURN_PROBLEM_MESSAGES[problem];
}

/** The tracker's projection of a stored budget (`null` before the turn starts). */
export function turnBudgetOf(
  stored: string | null,
  moveNote?: string | null,
): TurnBudgetView | null {
  if (stored === null) return null;
  return cpredTurnBudget(readCpredTurn(stored), moveNote ?? undefined);
}

/**
 * Is the turn's Action still unspent? „Wstrzymanie Akcji" reserves it rather
 * than spending it, so the tracker has to ask before letting anyone hold.
 */
export function turnActionAvailable(stored: string | null): boolean {
  return readCpredTurn(stored ?? undefined).action === null;
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
  /**
   * The round that landed (stage 16g). Everything it changes about this hit —
   * how much armour wears down, whether a Critical Injury is drawn at all,
   * whether the target can be dropped below 1 HP — is read off these flags, so
   * the damage path never learns the name of a single cartridge.
   */
  ammo?: CpredAmmoProfile;
}

/** The part of the chat log the system fills in. */
export type SheetDamageLog = Omit<
  DamageLogEntry,
  | 'targetTokenId'
  | 'targetCoverId'
  | 'targetName'
  | 'sourceMessageId'
  | 'targetOwnerId'
  | 'characterId'
>;

/**
 * The same hit against a **cover** (stage 16c) — a car, a bollard, a crate.
 *
 * Three of the four things `applyDamageToSheet` does are deliberately absent,
 * and each absence is a rule rather than a simplification:
 *
 *  - **no armour.** „Jeśli nie może zatrzymać kuli, nie jest to osłona i nie ma
 *    PW" (s. 179) — cover is body points, not Stopping Power, so there is
 *    nothing to subtract and nothing to ablate;
 *  - **no Critical Injury and no Death Save.** An object has no anatomy and
 *    nothing to stabilise. Two sixes on the damage dice mean two sixes;
 *  - **no wound statuses.** A dented car is not „Poważnie ranny".
 *
 * What is left is the one rule the stage exists for: **the overflow stops
 * here.** „Jeśli PW osłony spadną do 0, pozostałe obrażenia tego ataku
 * przepadają i postać za osłoną ich nie otrzymuje" (s. 179) — which falls out
 * of applying the hit to the cover alone and clamping at zero.
 */
export function applyDamageToCover(
  hp: { current: number; max: number },
  request: Pick<SheetDamageRequest, 'damage'>,
): { hpCurrent: number; log: SheetDamageLog } {
  const damage = Math.max(0, Math.round(request.damage));
  const before = Math.max(0, Math.min(hp.current, hp.max));
  const after = Math.max(0, before - damage);
  return {
    hpCurrent: after,
    log: {
      location: 'body',
      locationLabel: 'osłona',
      damageRolled: damage,
      armorSp: 0,
      damageThrough: damage,
      doubled: false,
      bonusDamage: 0,
      hpLost: before - after,
      hp: { before, after, max: hp.max },
      ...(after === 0 && before > 0
        ? {
            woundLabel:
              damage > before
                ? `Osłona zniszczona — nadwyżka ${damage - before} obrażeń przepada`
                : 'Osłona zniszczona',
          }
        : {}),
    },
  };
}

/** The card's ammunition block: the round's name and what it changed. */
function ammoLogEntry(
  ammo: CpredAmmoProfile,
  outcome: Parameters<typeof ammoDamageNotes>[1],
): NonNullable<DamageLogEntry['ammo']> {
  const notes = ammoDamageNotes(ammo, outcome);
  return { name: ammo.name, ...(notes.length > 0 ? { notes } : {}) };
}

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
): { data: string; hp: TokenHp; log: SheetDamageLog; carry: SheetTurnCarry | null } {
  const data = parseCharacterData(character.data, registry);
  const location = normalizeLocation(request.location);
  const max = hpMax(data.stats);
  const armorRow = effectiveArmor(data.armor, location);
  const armorSp = request.armorSp ?? armorRow?.spCurrent ?? 0;
  const ammo = request.ammo ?? null;
  // „Ta amunicja nie powoduje Ran Krytycznych" (s. 346) takes the bonus damage
  // with it: the 5 points are part of the Critical Injury rule, not a separate
  // effect of rolling two sixes.
  const criticalInjury = request.criticalInjury && ammo?.noCriticalInjury !== true;

  const outcome = resolveCpredDamage({
    damage: request.damage,
    location,
    armorSp,
    hpCurrent: data.hpCurrent,
    hpMax: max,
    criticalInjury,
    ignoreArmor: request.ignoreArmor,
    ablation: ammoAblation(ammo),
    ...(ammo?.nonLethal ? { nonLethal: true } : {}),
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

  // A wound that takes the next turn's Action away is a debt against a turn
  // that has not begun — and may not even belong to whoever is acting now.
  let carry: SheetTurnCarry | null = null;

  if (outcome.criticalInjury) {
    const pool = injuries.filter(isCriticalInjuryEntry);
    const draw = drawCriticalInjury(
      pool,
      location,
      rng,
      data.criticalInjuries.map((injury) => injury.id),
      // Dumdum: „cel rzuca ponownie …, dopóki nie wylosuje rany innej niż Ciało
      // obce" (s. 345). Which injury triggers it is data, so a GM's own table
      // works the same way.
      ammo?.extraInjuryOn ? { extraOnIds: ammo.extraInjuryOn } : {},
    );
    const rolled = draw.rolls[draw.rolls.length - 1]?.total ?? 0;
    if (draw.entry) {
      const row = toCriticalInjuryRow(draw.entry, draw.extra ? draw.rolls[0]!.total : rolled);
      const rows = [row];
      log.injury = { id: row.id, name: row.name, effect: row.effect, rolled: row.rolled ?? rolled };
      carry = cpredInjuryCarryOnDraw(row);
      // „Następnie cel otrzymuje **także** tę wylosowaną Ranę Krytyczną. Nie
      // zadaje ona kolejnych obrażeń dodatkowych" — a second wound on the same
      // hit, and the 5 bonus points stay counted once.
      if (draw.extra) {
        const second = toCriticalInjuryRow(draw.extra.entry, draw.extra.rolled);
        rows.push(second);
        log.injuryExtra = {
          id: second.id,
          name: second.name,
          effect: second.effect,
          rolled: draw.extra.rolled,
        };
        carry = mergeSheetCarry(carry, cpredInjuryCarryOnDraw(second) ?? {});
      }
      patch.criticalInjuries = [...data.criticalInjuries, ...rows];
    } else if (draw.exhausted) {
      log.injuryNote = 'Cel ma już wszystkie rany z tej tabeli.';
    } else {
      log.injuryNote = `Brak wpisu na ${rolled} w tabeli ran (${hitLocationLabel(location)}) — uzupełnij kompendium.`;
    }
  }

  // What the round itself did, as named entries rather than silent arithmetic.
  if (ammo) {
    log.ammo = ammoLogEntry(ammo, {
      ablated: ablatedRow ? outcome.spBefore - outcome.spAfter : 0,
      heldAtOne: outcome.heldAtOne,
      injurySuppressed: request.criticalInjury && ammo.noCriticalInjury === true,
    });
  }

  const merged = mergeCharacterData(data, patch);
  return {
    data: JSON.stringify(merged),
    hp: { current: merged.hpCurrent, max },
    log,
    carry,
  };
}

/**
 * Row id the ablated armour of a statist is logged under (stage 16b).
 *
 * A sheet ablates a named armour *row*; a profile has one number and no rows,
 * but „Cofnij" reads the log rather than the target, so the entry still needs an
 * id to point at. A constant is enough — a statist wears one thing.
 */
export const SHEET_STATIST_ARMOR_ROW_ID = 'statist-armor';

/**
 * The same hit against a statist token that only has its own HP pair.
 *
 * Since stage 16b the token may also carry a combat profile, and then its
 * Stopping Power is applied and ablated exactly as a sheet's would be — the GM
 * stopped having to remember the number and type it into every hit. An explicit
 * `armorSp` in the request still wins and leaves the profile alone, the same
 * bargain `applyDamageToSheet` makes with a hand-typed value.
 */
export function applyDamageToTokenHp(
  hp: TokenHp,
  request: SheetDamageRequest,
  profile?: SheetCombatProfile | null,
): { hp: TokenHp; log: SheetDamageLog; profile?: SheetCombatProfile } {
  const location = normalizeLocation(request.location);
  const profileSp = profile?.armorSp ?? 0;
  const ammo = request.ammo ?? null;
  const criticalInjury = request.criticalInjury && ammo?.noCriticalInjury !== true;
  const outcome = resolveCpredDamage({
    damage: request.damage,
    location,
    armorSp: request.armorSp ?? profileSp,
    hpCurrent: hp.current,
    hpMax: hp.max,
    criticalInjury,
    ignoreArmor: request.ignoreArmor,
    ablation: ammoAblation(ammo),
    ...(ammo?.nonLethal ? { nonLethal: true } : {}),
  });
  // Only the profile's own armour wears out, and only when it stopped
  // something: a value the GM typed in by hand is a one-off ruling, not a
  // claim about what this extra is wearing.
  const ablated = profile && request.armorSp === undefined && outcome.ablated && profileSp > 0;
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
    ...(ablated
      ? {
          armor: {
            rowId: SHEET_STATIST_ARMOR_ROW_ID,
            name: 'Pancerz',
            before: outcome.spBefore,
            after: outcome.spAfter,
          },
        }
      : {}),
    ...(woundTransitionLabel(outcome) ? { woundLabel: woundTransitionLabel(outcome)! } : {}),
    // A statist has no sheet to carry an injury — the GM plays it out by hand.
    ...(outcome.criticalInjury
      ? { injuryNote: 'Cel bez karty postaci — ranę krytyczną rozegraj ręcznie.' }
      : {}),
    ...(ammo
      ? {
          ammo: ammoLogEntry(ammo, {
            ablated: ablated ? outcome.spBefore - outcome.spAfter : 0,
            heldAtOne: outcome.heldAtOne,
            injurySuppressed: request.criticalInjury && ammo.noCriticalInjury === true,
          }),
        }
      : {}),
  };
  return {
    hp: { current: outcome.hpAfter, max: hp.max },
    log,
    ...(ablated ? { profile: { ...profile, armorSp: outcome.spAfter } } : {}),
  };
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
  // Remove one instance of each drawn injury, not every injury of that id. Two
  // of them when a dumdum round chewed its way in (stage 16g).
  const drawn = [entry.injury, entry.injuryExtra].filter(
    (injury): injury is NonNullable<DamageLogEntry['injury']> => injury !== undefined,
  );
  if (drawn.length > 0) {
    let remaining = [...data.criticalInjuries];
    for (const injury of drawn) {
      const index = remaining.findIndex((row) => row.id === injury.id);
      if (index >= 0) remaining = remaining.filter((_, position) => position !== index);
    }
    patch.criticalInjuries = remaining;
  }
  const merged = mergeCharacterData(data, patch);
  return { data: JSON.stringify(merged), hp: { current: merged.hpCurrent, max } };
}
