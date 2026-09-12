import type {
  CpredEffectClock,
  CpredStatEffect,
  CpredCombatAwarenessEffects,
  CpredRoundOnceId,
  CompendiumEntry,
  CpredChokeOutcome,
  CpredCharacterData,
  CpredAimPoint,
  CpredCriticalInjuryRow,
  CpredHitLocation,
  CpredAmmoProfile,
  CpredPeriodicDamage,
  CpredRegistry,
  CpredReputation,
  CpredBackupPending,
  CpredBackupTier,
  CpredCombatState,
  CpredTurnCarryInput,
  CpredTurnProblem,
  CpredTurnSpend,
  CpredWoundState,
  DamageLogEntry,
  CpredTimedEffect,
  CpredTimedInjury,
  DiceRng,
  RollBreakdownEntry,
  ReinforcementView,
  TokenHp,
  TokenInjuryRow,
  TurnBudgetView,
} from '@vtt/shared';
import {
  CPRED_STAT_EFFECTS_MAX,
  cpredExpireStatEffects,
  cpredEffectiveStats,
  cpredArmorStatPenalty,
  cpredSheetCombatAwareness,
  cpredRoundOnceUsed,
  markCpredRoundOnce,
  clearCpredRoundOnce,
  CPRED_ACTIONS,
  CPRED_AIM_POINT_LABELS,
  CPRED_ARMOR_PENALTY_LABEL,
  CPRED_BROKEN_LEG_ROLL,
  CPRED_BROKEN_LEG_TABLE,
  CPRED_EMP_STATUS_ID,
  CPRED_FIRE_INTENSITIES,
  CPRED_GRAPPLED_STATUS_ID,
  CPRED_GRAPPLE_PENALTY,
  CPRED_GRAPPLE_PENALTY_LABEL,
  CPRED_FACEDOWN_PENALTY,
  CPRED_FACEDOWN_PENALTY_LABEL,
  CPRED_HIT_LOCATIONS,
  CPRED_INTIMIDATED_STATUS_ID,
  CPRED_ON_FIRE_STATUS_ID,
  CPRED_PRONE_STATUS_ID,
  CPRED_STAT_LABELS,
  CPRED_STATIST_GRAPPLE_DV,
  CPRED_SLOWED_STATUS_ID,
  CPRED_SUPPRESSED_STATUS_ID,
  CPRED_TURN_PROBLEM_MESSAGES,
  CPRED_UNCONSCIOUS_STATUS_ID,
  CPRED_WOUND_LABELS,
  NO_REPUTATION,
  STATIST_DEFAULT_STAT,
  STATIST_WEAPON_ROW_ID,
  ammoAblation,
  ammoDamageNotes,
  applyWoundStatuses,
  applyStatistQuick,
  createStatistSheet,
  cpredSheetRollSheet,
  sanitizeStatistQuick,
  statistQuick,
  type CpredStatistQuick,
  CPRED_HEAD_DAMAGE_MULTIPLIER,
  cpredAction,
  cpredActionBlock,
  cpredBackupDue,
  cpredBackupTier,
  describeBackupPending,
  readCpredCombatState,
  cpredDodgeBlock,
  cpredExpiringStatuses,
  cpredExpiryRound,
  cpredGrappleBase,
  cpredHeadDamageMultiplier,
  cpredHumanShieldCovers,
  cpredInjuryCarryOnDraw,
  cpredInjuryDodgeBlock,
  cpredInjuryModifiers,
  cpredSlowedMoveModifier,
  cpredInjuryTurnEnd,
  cpredMetresLeft,
  cpredMoveBudgetFromSheet,
  cpredMoveRefusal,
  cpredMovementBlock,
  cpredFacedownBase,
  cpredPassiveFacedownTotal,
  cpredPassiveGrappleDv,
  cpredPeriodicDamage,
  cpredSheetReputation,
  cpredStatusHasDialableDamage,
  cpredTurnBlockReason,
  cpredTurnPhaseRan,
  cpredTurnBudget,
  cpredTurnReminders,
  cpredTimedExpired,
  describeCpredTimer,
  setCpredHardTerrain,
  withCpredMoveAllowance,
  criticalInjuryAt,
  criticalInjuryNames,
  drawCriticalInjury,
  effectiveArmor,
  forceCpredTurn,
  freshCpredTurn,
  hitLocationLabel,
  cpredSheetHpMax,
  isCriticalInjuryEntry,
  markCpredTurnPhase,
  mergeCharacterData,
  nextCpredChokeStreak,
  parseCharacterData,
  readCpredTurn,
  readCpredTurnLedger,
  resolveCpredChoke,
  resolveCpredDamage,
  resolveCpredGrappleTest,
  resolveCpredThrow,
  spendCpredTurn,
  namedCriticalInjuryRow,
  toCriticalInjuryRow,
  woundTransitionLabel,
} from '@vtt/shared';
import type { Character, Token } from './generated/prisma/client.js';

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
  /**
   * Rany krytyczne tej karty, w kształcie, w jakim jadą na żetonie (etap 38a).
   *
   * Tu, a nie osobnym zapytaniem, bo `toTokenView` i tak trzyma tę kartę
   * w ręku — a rany figury bez właściciela są **publiczne** (31.08), więc
   * musiały skądś przyjechać po tym, jak zniknął profil bojowy.
   */
  injuries: TokenInjuryRow[];
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
  // Etap 39: REF **jak teraz**. Inicjatywa jest wprost REF-em, więc Lisz musi
  // przestawić figurę w kolejce — i przestawia też remis, bo remis **jest**
  // REF-em i drugiego REF-u nie ma.
  const stats = cpredEffectiveStats(data);
  // „Modyfikator pancerza: −2 REF, ZW i RUCH" (s. 185). Initiative is REF, so
  // heavy armour slows the queue too — and it moves the tie-break with it,
  // because the tie-break *is* REF and there is only one REF to be had.
  const armor = cpredArmorStatPenalty(data.armor, 'ref', stats.ref);
  const ref = stats.ref + armor;
  // „Każdy przydzielony punkt to +1 do rzutów na Inicjatywę" (Błyskawiczna
  // reakcja, s. 146). It moves the total, never the tie-break: RAW breaks ties
  // by REF, and a Solo's training is not reflexes.
  const fastReflexes = cpredSheetCombatAwareness(data, registry).initiative;
  const refLabel = `${CPRED_STAT_LABELS.ref.name} (${CPRED_STAT_LABELS.ref.abbr})`;
  const armorLabel = armor === 0 ? '' : ` ${CPRED_ARMOR_PENALTY_LABEL} ${armor}`;
  return {
    modifier: ref + fastReflexes,
    tieBreak: ref,
    label:
      fastReflexes > 0
        ? `${refLabel}${armorLabel} + Błyskawiczna reakcja ${fastReflexes}`
        : `${refLabel}${armorLabel}`,
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
  // Net Actions come out of the turn's one Action (stage 26b) — the first of
  // them claims it, and the rest are already inside what it claimed.
  if (spend.kind === 'net') return true;
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

/**
 * Movement allowance of a linked sheet: effective RUCH × 2, and what shrank it.
 *
 * `extra` carries the penalties that live on the *token* rather than on the
 * sheet (stage 26f: „Maź — RUCH −7"), already rolled and already named, so the
 * note reads „Pancerz −2 · Maź −7" and the player is never quietly slowed.
 */
export function readSheetMoveBudget(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
  extra: readonly { label: string; value: number }[] = [],
): SheetMoveBudget {
  const data = parseCharacterData(character.data, registry);
  const budget = cpredMoveBudgetFromSheet({
    // RUCH bazowy — efekty czasowe wchodzą niżej **nazwanymi** modyfikatorami
    // (`statEffects`), żeby pasek pisał „Skorpion −4", a nie milczał.
    move: data.stats.move,
    hpCurrent: data.hpCurrent,
    hpMax: cpredSheetHpMax(data),
    armor: data.armor,
    injuries: data.criticalInjuries,
    statEffects: data.statEffects,
    extra,
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

/** Status a defence system's MOVE drain rides on (stage 26f). */
export const SHEET_SLOWED_STATUS_ID = CPRED_SLOWED_STATUS_ID;

/**
 * The MOVE penalty this token carries from something standing on the map, as a
 * named modifier ready for `readSheetMoveBudget` — or null when it carries none.
 */
export function sheetSlowedMoveModifier(
  token: Pick<Token, 'statuses' | 'statusData'>,
): { label: string; value: number } | null {
  return cpredSlowedMoveModifier(
    readTokenStatusList(token.statuses),
    readSheetStatusData(token.statusData),
  );
}

function readTokenStatusList(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

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

/* ------------------------------------------------------------------ *
 * Figura bez własnej karty (etap 38a).
 *
 * Do 38a mieszkał tu cały szew „profil bojowy przebrany za kartę": żeton
 * niósł kilkanaście liczb w kolumnie JSON, a `sheetFromCombatProfile`
 * ubierał je w `CpredCharacterData` przy każdym rzucie. Etap 38a dał każdej
 * ostatystykowanej figurze prawdziwy rekord `Character`, więc został tu tylko
 * jeden most — podstawienie Wartości bojowej — i garść liczb zastępczych dla
 * figury, której **naprawdę** nikt nie ostatystykował.
 * ------------------------------------------------------------------ */

/** Stand-in DV of a defender who has no card at all. */
export const SHEET_STATIST_GRAPPLE_DV = CPRED_STATIST_GRAPPLE_DV;

/**
 * Karta przygotowana do jednego rzutu.
 *
 * Jedyne miejsce, w którym Wartość bojowa i poziom broni z bloku statystyk
 * wchodzą do liczb (`statblock.ts`). Woła się je wszędzie tam, gdzie do 38a
 * wołało się `sheetFromCombatProfile` — i nigdzie indziej: karta **zapisana**
 * ma trzymać to, co wydrukowano, a nie to, co z tego wychodzi w rzucie.
 */
export function sheetForRoll(data: CpredCharacterData, skillId: string | null): CpredCharacterData {
  return cpredSheetRollSheet(data, skillId);
}

/**
 * Sześć pól szybkiego edytora w menu żetonu, jako typ serwera (etap 38a).
 *
 * Rdzeń VTT niesie je jako nieprzezroczysty obiekt (`TokenCombatProfile`),
 * dokładnie tak, jak niósł profil bojowy; tu, po systemowej stronie szwu,
 * dostają kształt.
 */
export type SheetQuickStats = CpredStatistQuick;

/** Naprawia to, co przyszło z menu żetonu. Nigdy nie odmawia (patrz 16b). */
export function sheetQuickStats(raw: unknown): SheetQuickStats {
  return sanitizeStatistQuick(raw);
}

/** Karta świeżo ostatystykowanej figury, gotowa do zapisu w kolumnie. */
export function sheetFromQuickStats(quick: SheetQuickStats): string {
  return JSON.stringify(createStatistSheet(quick));
}

/** Sześć pól, jak widać je na istniejącej karcie. */
export function readSheetQuickStats(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
): SheetQuickStats {
  return statistQuick(parseCharacterData(character.data, registry));
}

/**
 * Wpisuje sześć pól w istniejącą kartę i zwraca kolumnę do zapisu.
 *
 * Przez `mergeCharacterData`, żeby pule przycięły się tak samo jak przy każdym
 * innym zapisie karty — a nie „bo szybki edytor to co innego".
 */
export function writeSheetQuickStats(
  character: Pick<Character, 'data'>,
  quick: SheetQuickStats,
  registry: SheetRegistry,
): string {
  const current = parseCharacterData(character.data, registry);
  return JSON.stringify(mergeCharacterData(current, applyStatistQuick(current, quick)));
}

/** The single weapon row id a figure statted from the token menu carries. */
export const SHEET_STATIST_WEAPON_ROW_ID = STATIST_WEAPON_ROW_ID;

/**
 * The token's own HP pair, with a sane stand-in for a token that has no bar.
 *
 * Zostaje po 38a dla figur **bez** karty: kółko na mapie z paskiem PW jest
 * funkcją rdzenia VTT starszą od Cyberpunka o dziesięć etapów.
 */
export function sheetTokenHp(token: Pick<Token, 'hpCurrent' | 'hpMax'>): TokenHp {
  if (token.hpMax === null) return { current: 1, max: 1 };
  return { current: token.hpCurrent ?? 0, max: token.hpMax };
}

/** BODY of a sheet: the damage Duszenie and Rzut deal, flat and undiced. */
export function readSheetBody(character: Pick<Character, 'data'>, registry: SheetRegistry): number {
  return cpredEffectiveStats(parseCharacterData(character.data, registry)).body;
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
  const max = cpredSheetHpMax(data);
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
  const max = cpredSheetHpMax(data);
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

/**
 * What failing a round's forced check costs a sheet (stage 16h).
 *
 * Everything here is *named*, never drawn: „porażka to Rana Krytyczna »Uraz
 * oka«" picks one row out of the table, unlike the 2d6 of an ordinary Critical
 * Injury. The wound is otherwise identical — same id, same effect text, same
 * machine flags — which is why a temporary „Uraz ucha" stops a run exactly as a
 * permanent one does.
 *
 * Damage is direct: „obrażenia bezpośrednie" throughout this half of the
 * ammunition table, so armour neither subtracts nor wears down.
 */
export interface SheetForcedFailure {
  /** Damage already rolled by the caller; 0 when the round only wounds. */
  damage: number;
  /** Injuries to add, by compendium id. */
  injuryIds?: readonly string[];
  /** When those wounds come off by themselves; absent = they stay. */
  timed?: CpredTimedInjury;
}

export function applyForcedFailureToSheet(
  character: Character,
  registry: SheetRegistry,
  failure: SheetForcedFailure,
  compendium: readonly CompendiumEntry[],
): { data: string; hp: TokenHp; log: SheetDamageLog; carry: SheetTurnCarry | null } {
  const data = parseCharacterData(character.data, registry);
  const max = cpredSheetHpMax(data);
  const outcome = resolveCpredDamage({
    damage: Math.max(0, Math.round(failure.damage)),
    location: 'body',
    armorSp: 0,
    hpCurrent: data.hpCurrent,
    hpMax: max,
    criticalInjury: false,
    ignoreArmor: true,
  });
  const log = periodicDamageLog(outcome, max);
  const patch: Partial<CpredCharacterData> = { hpCurrent: outcome.hpAfter };

  const rows: CpredCriticalInjuryRow[] = [];
  const missing: string[] = [];
  let carry: SheetTurnCarry | null = null;
  for (const id of failure.injuryIds ?? []) {
    const entry = compendium.find((row) => row.id === id && isCriticalInjuryEntry(row));
    if (!entry || !isCriticalInjuryEntry(entry)) {
      missing.push(id);
      continue;
    }
    // A wound that is already there is not doubled: a second flashbang in the
    // same minute does not blind somebody twice, it just keeps them blind — and
    // the timer of the row already on the sheet is left alone, because the
    // longer of two overlapping minutes is the one that matters.
    if (data.criticalInjuries.some((injury) => injury.id === id)) continue;
    // Rany nikt nie wyrzucił — nazwał ją efekt (gaz, granat hukowy, broniona
    // strefa) albo ręka MG, więc wiersz idzie bez `rolled` i z chipem „nadana".
    const row = namedCriticalInjuryRow(entry);
    rows.push({ ...row, ...(failure.timed ? { timed: failure.timed } : {}) });
    carry = mergeSheetCarry(carry, cpredInjuryCarryOnDraw(row) ?? {});
  }
  if (rows.length > 0) patch.criticalInjuries = [...data.criticalInjuries, ...rows];
  if (rows[0]) {
    // Zero na karcie obrażeń znaczy „bez rzutu" i tak je czyta `DamageControls`
    // (`rolled > 0`) — wiersz na karcie postaci niesie już własną prowieniencję.
    log.injury = { id: rows[0].id, name: rows[0].name, effect: rows[0].effect, rolled: 0 };
  }
  if (rows[1]) {
    log.injuryExtra = { id: rows[1].id, name: rows[1].name, effect: rows[1].effect, rolled: 0 };
  }
  if (missing.length > 0) {
    log.injuryNote = `Brak w kompendium rany: ${missing.join(', ')} — uzupełnij tabelę ran.`;
  }

  const merged = mergeCharacterData(data, patch);
  return {
    data: JSON.stringify(merged),
    hp: { current: merged.hpCurrent, max },
    log,
    carry: sheetCarryIsEmpty(carry) ? null : carry,
  };
}

/**
 * A damage log with nothing in it — the shape a card needs when a rule hurt
 * nobody's HP and only named a wound. Lived in two copies (`ammo-effects.ts`
 * and `zone-effects.ts`) until 29.08, when a third caller made one the answer.
 */
export function emptySheetDamageLog(): SheetDamageLog {
  return {
    location: 'body',
    locationLabel: hitLocationLabel('body'),
    damageRolled: 0,
    armorSp: 0,
    damageThrough: 0,
    doubled: false,
    bonusDamage: 0,
    hpLost: 0,
  };
}

/**
 * Ten sam wymuszony brak zdania przeciwko figurze **bez karty** (29.08, 38a).
 *
 * Gaz łzawiący, granat hukowy i broniona strefa nazywają ranę, którą zadają.
 * Figura, którą ktoś ostatystykował, ma od etapu 38a prawdziwą kartę i jedzie
 * przez `applyForcedFailureToSheet` — czyli przez ten sam kod, co gracz.
 * Zostaje tu wyłącznie kółko z paskiem PW, którego nikt nie ostatystykował:
 * obrażenia spadają, a rana zostaje **nazwana**, bo nie ma jej gdzie zapisać.
 *
 * To zdanie jest warte zachodu: jest jedynym sposobem, w jaki stół dowiaduje
 * się, co się stało (błąd #6 z sesji 08.08).
 */
export function applyForcedFailureToTokenHp(
  hp: TokenHp | null,
  failure: SheetForcedFailure,
  compendium: readonly CompendiumEntry[],
): { hp: TokenHp | null; log: SheetDamageLog } {
  const damaged = hp ? applyPeriodicDamageToTokenHp(hp, failure.damage) : null;
  const log: SheetDamageLog = damaged?.log ?? emptySheetDamageLog();
  const wanted = failure.injuryIds ?? [];
  if (wanted.length > 0) {
    log.injuryNote = `${criticalInjuryNames(compendium, wanted).join(', ')} — figura nie ma karty, ranę krytyczną rozstrzyga MG.`;
  }
  return { hp: damaged?.hp ?? hp, log };
}

/**
 * Wounds a sheet carries that the round counter has caught up with (stage 16h).
 *
 * Returns the rows to take off and the sheet without them, so the caller can
 * both write the sheet back and say on the card *which* wound healed.
 */
export function expireSheetInjuries(
  character: Character,
  registry: SheetRegistry,
  round: number,
): { data: string; expired: CpredCriticalInjuryRow[] } | null {
  const data = parseCharacterData(character.data, registry);
  const expired = data.criticalInjuries.filter(
    (injury) => injury.timed && cpredTimedExpired(injury.timed, round),
  );
  if (expired.length === 0) return null;
  const merged = mergeCharacterData(data, {
    criticalInjuries: data.criticalInjuries.filter((injury) => !expired.includes(injury)),
  });
  return { data: JSON.stringify(merged), expired };
}

/* ------------------------------------------------------------------ *
 * Efekty czasowe na Cechach (etap 39)
 * ------------------------------------------------------------------ */

/**
 * Dokłada karcie jeden efekt na Cesze — z wyliczonymi już terminami.
 *
 * Liczbę rzuca **wołający** i podaje ją gotową: „1k6" w opisie Programu jest
 * instrukcją dla chwili nałożenia, a nie formułą efektu (patrz nagłówek
 * `stateffects.ts`). Ten moduł tylko dopisuje wiersz, więc jedno miejsce
 * odpowiada za zapis niezależnie od tego, czy efekt przyszedł z Czarnego LOD-u,
 * czy z ręki MG.
 */
export function applyStatEffectToSheet(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
  effect: CpredStatEffect,
): { data: string; effect: CpredStatEffect } | null {
  const data = parseCharacterData(character.data, registry);
  if (data.statEffects.length >= CPRED_STAT_EFFECTS_MAX) return null;
  const merged = mergeCharacterData(data, { statEffects: [...data.statEffects, effect] });
  return { data: JSON.stringify(merged), effect };
}

/** Zdejmuje jeden efekt po id — guzik „zdejmij" u MG. */
export function removeStatEffectFromSheet(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
  effectId: string,
): { data: string; removed: CpredStatEffect } | null {
  const data = parseCharacterData(character.data, registry);
  const removed = data.statEffects.find((row) => row.id === effectId);
  if (!removed) return null;
  const merged = mergeCharacterData(data, {
    statEffects: data.statEffects.filter((row) => row.id !== effectId),
  });
  return { data: JSON.stringify(merged), removed };
}

/**
 * Zdejmuje z karty wszystko, czego czas minął — obiema wskazówkami naraz.
 *
 * `null`, gdy nie ma czego zdejmować: wołający zapisuje kartę **tylko** wtedy,
 * gdy coś się zmieniło, bo przemiatanie jedzie po każdej figurze na scenie i po
 * każdym skoku zegara.
 */
export function expireSheetStatEffects(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
  clock: CpredEffectClock,
): { data: string; expired: CpredStatEffect[] } | null {
  const data = parseCharacterData(character.data, registry);
  if (data.statEffects.length === 0) return null;
  const { kept, expired } = cpredExpireStatEffects(data.statEffects, clock);
  if (expired.length === 0) return null;
  const merged = mergeCharacterData(data, { statEffects: kept });
  return { data: JSON.stringify(merged), expired };
}

/** Efekty, które karta niesie teraz — lista dla okna zegara i paska figury. */
export function readSheetStatEffects(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
): CpredStatEffect[] {
  return parseCharacterData(character.data, registry).statEffects;
}

/** Wounds a sheet carries that will heal by themselves — the GM's prompt list. */
export function readSheetTimedInjuries(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
): CpredCriticalInjuryRow[] {
  return parseCharacterData(character.data, registry).criticalInjuries.filter(
    (injury) => injury.timed !== undefined,
  );
}

/**
 * Heals one self-healing wound by id — the GM's „Minęła minuta" button.
 *
 * Only a wound that carries a timer may go this way. An ordinary Critical
 * Injury is taken off by treatment or by „Cofnij", and letting this button
 * remove one would make it a third way to heal that nobody asked for. Outside a
 * fight a timer has no round to expire at, which is exactly why the button
 * exists rather than being an optimisation of the sweep.
 */
export function removeSheetTimedInjury(
  character: Character,
  registry: SheetRegistry,
  injuryId: string,
): { data: string; removed: CpredCriticalInjuryRow } | null {
  const data = parseCharacterData(character.data, registry);
  const index = data.criticalInjuries.findIndex(
    (injury) => injury.id === injuryId && injury.timed !== undefined,
  );
  if (index === -1) return null;
  const removed = data.criticalInjuries[index]!;
  const merged = mergeCharacterData(data, {
    criticalInjuries: data.criticalInjuries.filter((_, position) => position !== index),
  });
  return { data: JSON.stringify(merged), removed };
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

/** Timers riding along with them (stage 16h) — „Nieprzytomny na minutę". */
export type SheetStatusTimers = Record<string, CpredTimedEffect>;

/** Everything one status carries beside its id. */
interface StatusEntry {
  damage?: number;
  timer?: CpredTimedEffect;
  /**
   * Tokens this one lost a Konfrontacja to and did not withdraw from (stage
   * 23c) — the addresses the −2 applies against.
   *
   * A list rather than a single id because RAW ends the penalty when „uda ci
   * się pokonać wroga", one enemy at a time: a punk who backed down twice in an
   * evening is afraid of two people, and beating one of them does not make the
   * other less frightening.
   */
  feared?: string[];
  /**
   * Cyborgizacje, które Impuls EMP wyłączył tym trafieniem (04.09.2026).
   *
   * Nazwy, nie identyfikatory wierszy — czyta je stół na karcie czatu i monit
   * „Minęła minuta", a wiersz karty może w międzyczasie zniknąć. Lista jedzie
   * przy statusie, a nie na karcie postaci, dokładnie z tego powodu, co
   * `feared`: znika razem ze statusem, więc zdjęcie naklejki ręką przez MG
   * zamyka sprawę bez sprzątania w drugim miejscu.
   */
  disabled?: string[];
}

/**
 * Reads the `Token.statusData` column whole.
 *
 * Stored as `{"on-fire":{"damage":6}}` rather than `{"on-fire":6}` so a later
 * stage could put a second number on a status without a migration — and stage
 * 16h is that stage: a timed status adds `{"timer":{…}}` beside the damage, and
 * nothing that reads the damage had to learn about it.
 */
function readStatusEntries(raw: string | null | undefined): Record<string, StatusEntry> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const entries: Record<string, StatusEntry> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue;
      const entry: StatusEntry = {};
      const damage = (value as { damage?: unknown }).damage;
      if (typeof damage === 'number' && Number.isFinite(damage)) {
        entry.damage = Math.max(0, Math.round(damage));
      }
      const timer = readStatusTimer((value as { timer?: unknown }).timer);
      if (timer) entry.timer = timer;
      const feared = (value as { feared?: unknown }).feared;
      if (Array.isArray(feared)) {
        const ids = feared.filter((id): id is string => typeof id === 'string' && id.length > 0);
        if (ids.length > 0) entry.feared = ids;
      }
      const disabled = (value as { disabled?: unknown }).disabled;
      if (Array.isArray(disabled)) {
        const names = disabled.filter(
          (name): name is string => typeof name === 'string' && name.length > 0,
        );
        if (names.length > 0) entry.disabled = names;
      }
      if (entry.damage !== undefined || entry.timer || entry.feared || entry.disabled) {
        entries[id] = entry;
      }
    }
    return entries;
  } catch {
    return {};
  }
}

/** One stored timer, or null when it is malformed — never a thrown sheet. */
function readStatusTimer(raw: unknown): CpredTimedEffect | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.source !== 'string' || value.source.length === 0) return null;
  if (typeof value.durationS !== 'number' || !Number.isFinite(value.durationS)) return null;
  const expires = value.expiresAtRound;
  return {
    source: value.source,
    durationS: Math.max(0, Math.round(value.durationS)),
    ...(typeof expires === 'number' && Number.isFinite(expires)
      ? { expiresAtRound: Math.round(expires) }
      : {}),
  };
}

/** The damage dials only — what the periodic-damage rules ask for. */
export function readSheetStatusData(raw: string | null | undefined): SheetStatusData {
  const values: SheetStatusData = {};
  for (const [id, entry] of Object.entries(readStatusEntries(raw))) {
    if (entry.damage !== undefined) values[id] = entry.damage;
  }
  return values;
}

/** The timers only — what the round counter asks for (stage 16h). */
export function readSheetStatusTimers(raw: string | null | undefined): SheetStatusTimers {
  const timers: SheetStatusTimers = {};
  for (const [id, entry] of Object.entries(readStatusEntries(raw))) {
    if (entry.timer) timers[id] = entry.timer;
  }
  return timers;
}

function serializeStatusEntries(entries: Record<string, StatusEntry>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(entries).map(([id, entry]) => [
        id,
        {
          ...(entry.damage !== undefined ? { damage: entry.damage } : {}),
          ...(entry.timer ? { timer: entry.timer } : {}),
          ...(entry.feared ? { feared: entry.feared } : {}),
          ...(entry.disabled ? { disabled: entry.disabled } : {}),
        },
      ]),
    ),
  );
}

/**
 * Writes one status's number back, or forgets the status entirely when `damage`
 * is null.
 *
 * „Entirely" includes its timer, and that is deliberate: the one caller that
 * passes null is the GM toggling the badge by hand, and a status a person just
 * set is theirs to take off — not the round counter's.
 */
export function writeSheetStatusData(
  raw: string | null | undefined,
  statusId: string,
  damage: number | null,
): string {
  const entries = readStatusEntries(raw);
  if (damage === null) delete entries[statusId];
  else entries[statusId] = { ...entries[statusId], damage: Math.max(0, Math.round(damage)) };
  return serializeStatusEntries(entries);
}

/**
 * Whom this token backed down from and never got even with (stage 23c).
 *
 * The sticker is the authority, not this list: an entry whose status the GM has
 * unchecked means nothing, which is what makes „zdejmij Onieśmielonego" a
 * complete answer at the table. Callers therefore check `statuses` first —
 * see `sheetFacedownPenalty`.
 */
export function readSheetFearedTokens(raw: string | null | undefined): string[] {
  return readStatusEntries(raw)[CPRED_INTIMIDATED_STATUS_ID]?.feared ?? [];
}

/** Writes that list back; an empty one forgets the status data entirely. */
export function writeSheetFearedTokens(
  raw: string | null | undefined,
  fearedTokenIds: readonly string[],
): string {
  const entries = readStatusEntries(raw);
  const unique = [...new Set(fearedTokenIds.filter((id) => id.length > 0))];
  const current = entries[CPRED_INTIMIDATED_STATUS_ID];
  if (unique.length === 0) {
    if (current) {
      const { feared: _dropped, ...rest } = current;
      if (Object.keys(rest).length === 0) delete entries[CPRED_INTIMIDATED_STATUS_ID];
      else entries[CPRED_INTIMIDATED_STATUS_ID] = rest;
    }
  } else {
    entries[CPRED_INTIMIDATED_STATUS_ID] = { ...current, feared: unique };
  }
  return serializeStatusEntries(entries);
}

/**
 * The −2 this token owes for a Konfrontacja it lost to `opponentTokenId`, as a
 * breakdown row — or nothing, which is the usual answer.
 *
 * Both halves have to line up: the sticker on the token *and* the address in
 * its data. That is not belt and braces, it is the manual override — the GM
 * takes the penalty off by unchecking the badge in the token menu, exactly as
 * they take off every other status.
 */
export function sheetFacedownPenalty(
  token: { statuses: readonly string[]; statusData: string | null },
  opponentTokenId: string | null | undefined,
): RollBreakdownEntry | null {
  if (!opponentTokenId) return null;
  if (!token.statuses.includes(CPRED_INTIMIDATED_STATUS_ID)) return null;
  if (!readSheetFearedTokens(token.statusData).includes(opponentTokenId)) return null;
  return {
    label: CPRED_FACEDOWN_PENALTY_LABEL,
    value: CPRED_FACEDOWN_PENALTY,
    kind: 'situational',
  };
}

/** Status the loser of a Konfrontacja wears while they carry the −2. */
export const SHEET_INTIMIDATED_STATUS_ID = CPRED_INTIMIDATED_STATUS_ID;

/** What the Street knows this sheet for — the level and its sign (stage 23c). */
export function readSheetReputation(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
): CpredReputation {
  return cpredSheetReputation(parseCharacterData(character.data, registry));
}

/**
 * CHA + Reputacja* of a sheet — the fixed half of its Konfrontacja roll.
 * A token with no sheet has neither: an unnamed ganger stares back at the
 * statist default of 5 and a Reputation of 0.
 */
export function readSheetFacedownBase(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
): number {
  const data = parseCharacterData(character.data, registry);
  return cpredFacedownBase(cpredEffectiveStats(data).cool, cpredSheetReputation(data));
}

/** Stand-in total of a side that has not rolled: CHA + Reputacja* + half a die. */
export function readSheetPassiveFacedown(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
): number {
  const data = parseCharacterData(character.data, registry);
  return cpredPassiveFacedownTotal(cpredEffectiveStats(data).cool, cpredSheetReputation(data));
}

/** The same, for a token nobody ever statted — bare CHA 5, no Reputation. */
export const SHEET_STATIST_FACEDOWN_TOTAL = cpredPassiveFacedownTotal(
  STATIST_DEFAULT_STAT,
  NO_REPUTATION,
);

/** Writes one status's timer back, or clears it, leaving its damage alone. */
export function writeSheetStatusTimer(
  raw: string | null | undefined,
  statusId: string,
  timer: CpredTimedEffect | null,
): string {
  const entries = readStatusEntries(raw);
  const current = entries[statusId];
  if (timer === null) {
    if (!current) return serializeStatusEntries(entries);
    if (current.damage === undefined) delete entries[statusId];
    else entries[statusId] = { damage: current.damage };
  } else {
    entries[statusId] = { ...current, timer };
  }
  return serializeStatusEntries(entries);
}

/**
 * Zapisuje przy statusie, co ten impuls wyłączył (04.09.2026).
 *
 * Osobna funkcja obok `writeSheetStatusTimer`, a nie jej dodatkowy argument:
 * timer stawia siedem rodzajów amunicji, a listę wyłączonych — jedna. Pusta
 * lista nie zapisuje niczego, więc figura bez chromu nie zostawia po sobie
 * pustego pola w bazie.
 */
export function writeSheetStatusDisabled(
  raw: string | null | undefined,
  statusId: string,
  names: readonly string[],
): string {
  const entries = readStatusEntries(raw);
  const clean = names.filter((name) => name.length > 0);
  if (clean.length === 0) return serializeStatusEntries(entries);
  entries[statusId] = { ...entries[statusId], disabled: [...clean] };
  return serializeStatusEntries(entries);
}

/** Co wróci, gdy ten status zejdzie — czytane przez sprzątanie po minucie. */
export function readSheetStatusDisabled(
  raw: string | null | undefined,
  statusId: string,
): string[] {
  return readStatusEntries(raw)[statusId]?.disabled ?? [];
}

/** The round an effect applied now expires at, or null when nothing counts. */
export const sheetExpiryRound = cpredExpiryRound;

/** True once the round counter has caught up with a timer (stage 16h). */
export const sheetTimedExpired = cpredTimedExpired;

/** „na minutę — do rundy 9" — how a timer reads on a card. */
export const describeSheetTimer = describeCpredTimer;

/** Cyberware knocked out by an EMP round for a minute (stage 16h). */
export const SHEET_EMP_STATUS_ID = CPRED_EMP_STATUS_ID;

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
 * Combat Awareness abilities that fire at most once a Round (stage 30a) —
 * „pierwsze obrażenia otrzymane w tej Rundzie" and „pierwszym udanym Atakiem
 * w Rundzie". Both live in the same round-stamped ledger the turn hooks use.
 */
export type SheetRoundOnce = CpredRoundOnceId;

/** True when this ability has already fired for this participant this Round. */
export function roundOnceUsed(stored: string | null, id: SheetRoundOnce, round: number): boolean {
  return cpredRoundOnceUsed(readCpredTurnLedger(stored ?? undefined), id, round);
}

/** Records that it has now fired, for the `turnEffects` column to keep. */
export function markRoundOnce(stored: string | null, id: SheetRoundOnce, round: number): string {
  return JSON.stringify(markCpredRoundOnce(readCpredTurnLedger(stored ?? undefined), id, round));
}

/** Takes the stamp back off — „Cofnij" on the card that spent it. */
export function clearRoundOnce(stored: string | null, id: SheetRoundOnce): string {
  return JSON.stringify(clearCpredRoundOnce(readCpredTurnLedger(stored ?? undefined), id));
}

/** What a Solo's Combat Awareness is worth on this sheet — zero for everyone else. */
export function readSheetCombatAwareness(
  character: Pick<Character, 'data'>,
  registry: SheetRegistry,
): CpredCombatAwarenessEffects {
  return cpredSheetCombatAwareness(parseCharacterData(character.data, registry), registry);
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
/**
 * What the fight as a whole is still owed (stage 30c) — the twin of
 * `turnBudgetOf`, one level up.
 *
 * The tracker asks; the system answers with rows it can paint. Everything CP
 * RED needs to *place* the group (which category, whose radio, where they
 * stand) stays inside the opaque column and never reaches the core.
 */
export function reinforcementsOf(stored: string | null): ReinforcementView[] {
  const state = readCpredCombatState(stored);
  return state.backup.map((entry) => {
    const tier = cpredBackupTier(entry.tierId);
    const view: ReinforcementView = {
      id: entry.id,
      label: describeBackupPending(entry),
      count: tier?.count ?? 1,
      round: entry.arriveAtRound,
    };
    if (entry.awaitingSecond) {
      view.question = 'Przybywa druga grupa Wsparcia — MG wybiera jej kategorię.';
    }
    return view;
  });
}

/** The system's whole memory of a running fight, parsed. */
export function combatSystemState(stored: string | null): CpredCombatState {
  return readCpredCombatState(stored);
}

/** Groups whose round has come and gone. */
export function backupDue(state: CpredCombatState, round: number): CpredBackupPending[] {
  return cpredBackupDue(state, round);
}

/** One category of Backup, by id. */
export function backupTierById(id: string): CpredBackupTier | null {
  return cpredBackupTier(id);
}

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
  return { current: data.hpCurrent, max: cpredSheetHpMax(data) };
}

export function toLinkedSheet(character: Character, registry: SheetRegistry): LinkedSheet {
  return {
    hp: readSheetHp(character, registry),
    ownerId: character.ownerId,
    injuries: readSheetInjuries(character, registry) as unknown as TokenInjuryRow[],
  };
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
  const max = cpredSheetHpMax(current);
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
  /**
   * The Aimed Shot this hit came from (s. 170), when it came from one.
   *
   * Read off the stored attack, never off the client — like `ammo`, and for the
   * same reason: it decides whether a leg breaks. The head needs nothing here
   * (its ×2 is `location: 'head'`); a leg and a held item both arrive as
   * `location: 'body'` and are told apart only by this field.
   */
  aimedAt?: CpredAimPoint;
  /** GM override of the SP protecting the target (statists, cover…). */
  armorSp?: number;
  ignoreArmor?: boolean;
  /**
   * Only half the armour stops this hit, rounded up (s. 176, 178).
   *
   * Read off the stored attack like `ammo` and `aimedAt`, and for the same
   * reason: „to była maczeta" is a fact about the swing that happened, and the
   * card may be applied a quarter of an hour later.
   */
  halvesArmor?: boolean;
  /**
   * HP the defender's own „Redukcja obrażeń" takes off this hit (stage 30a).
   *
   * Filled in by the caller, which is the only side that knows whether this is
   * the Round's *first* damage against this figure — the sheet knows what the
   * Solo allocated, not what has already happened this Round.
   */
  damageReduction?: number;
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
  const max = cpredSheetHpMax(data);
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
    ...(request.halvesArmor ? { halvesArmor: true } : {}),
    // „Pomnóż obrażenia głowy … x 3 (a nie x 2)" (s. 188) — read off the wound
    // the *target* already carries, which is why it cannot be a constant and
    // cannot travel with the attack either.
    headMultiplier: cpredHeadDamageMultiplier(data.criticalInjuries),
    ...(ammo?.nonLethal ? { nonLethal: true } : {}),
    ...(request.damageReduction ? { damageReduction: request.damageReduction } : {}),
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
    ...(outcome.armorHalved ? { armorHalved: true } : {}),
    ...(outcome.damageReduced > 0 ? { damageReduced: outcome.damageReduced } : {}),
    damageThrough: outcome.damageThrough,
    doubled: outcome.doubled,
    ...(outcome.doubled && outcome.headMultiplier !== CPRED_HEAD_DAMAGE_MULTIPLIER
      ? { headMultiplier: outcome.headMultiplier }
      : {}),
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

  // The Aimed Shot's own consequence (s. 170). Both surviving aim points share
  // one condition — „Jeśli przez pancerz na ciele celu przejdzie choć jeden
  // punkt obrażeń" — so a vest that swallowed the whole burst costs the target
  // nothing beyond the dent. The head is not here: its ×2 already happened.
  if (request.aimedAt && request.aimedAt !== 'head' && outcome.damageThrough > 0) {
    log.aimedAt = CPRED_AIM_POINT_LABELS[request.aimedAt];
    if (request.aimedAt === 'heldItem') {
      log.aimNote =
        'Cel upuszcza trzymany przedmiot (wybór atakującego) — pada na ziemię przed nim.';
    } else {
      const carried = new Set([
        ...data.criticalInjuries.map((injury) => injury.id),
        ...(patch.criticalInjuries ?? []).map((injury) => injury.id),
      ]);
      const entry = criticalInjuryAt(
        injuries.filter(isCriticalInjuryEntry),
        CPRED_BROKEN_LEG_TABLE,
        CPRED_BROKEN_LEG_ROLL,
      );
      if (!entry) {
        // The GM retyped the table and the eight is gone. Say so rather than
        // silently dropping the half of the rule that hurts.
        log.aimNote = 'Brak „Złamanej nogi" w tabeli ran korpusu — uzupełnij kompendium.';
      } else if (carried.has(entry.id)) {
        // „(jeśli ma niezłamaną nogę)" — the rules stop at one.
        log.aimNote = `Cel ma już ranę „${entry.name}" — trafienie w nogę nic nie dokłada.`;
      } else {
        // Nobody rolled for this one — the aim named it — so the sheet must not
        // print a 2k6 that never happened. Od 31.08 mówi to jedna funkcja
        // w `shared`, wspólna z gazem i z ręką MG (`namedCriticalInjuryRow`).
        const row: CpredCriticalInjuryRow = namedCriticalInjuryRow(entry);
        log.injuryAimed = { id: row.id, name: row.name, effect: row.effect };
        carry = mergeSheetCarry(carry, cpredInjuryCarryOnDraw(row) ?? {});
        patch.criticalInjuries = [...(patch.criticalInjuries ?? data.criticalInjuries), row];
      }
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
 * Trafienie w figurę, która ma **tylko** pasek PW (etap 38a).
 *
 * Kółko na mapie bez karty: żadnego pancerza, żadnych ran krytycznych — bo nie
 * ma ich gdzie zapisać. Figura, którą ktoś ostatystykował, jedzie od 38a przez
 * `applyDamageToSheet`, więc jej OB ściera się i jej rany zapisują się dokładnie
 * tak, jak graczowi; do 16b–38a robił to osobny tor po „profilu bojowym"
 * i to on właśnie zniknął.
 */
export function applyDamageToTokenHp(
  hp: TokenHp,
  request: SheetDamageRequest,
): { hp: TokenHp; log: SheetDamageLog } {
  const location = normalizeLocation(request.location);
  const ammo = request.ammo ?? null;
  const outcome = resolveCpredDamage({
    damage: request.damage,
    location,
    armorSp: request.armorSp ?? 0,
    hpCurrent: hp.current,
    hpMax: hp.max,
    criticalInjury: request.criticalInjury && ammo?.noCriticalInjury !== true,
    ignoreArmor: request.ignoreArmor,
    ablation: ammoAblation(ammo),
    ...(request.halvesArmor ? { halvesArmor: true } : {}),
    ...(ammo?.nonLethal ? { nonLethal: true } : {}),
  });
  const log: SheetDamageLog = {
    location,
    locationLabel: hitLocationLabel(location),
    damageRolled: outcome.damageRolled,
    armorSp: outcome.armorSp,
    ...(outcome.armorHalved ? { armorHalved: true } : {}),
    damageThrough: outcome.damageThrough,
    doubled: outcome.doubled,
    bonusDamage: outcome.bonusDamage,
    hpLost: outcome.hpLost,
    hp: { before: outcome.hpBefore, after: outcome.hpAfter, max: hp.max },
    ...(woundTransitionLabel(outcome) ? { woundLabel: woundTransitionLabel(outcome)! } : {}),
    ...(ammo
      ? {
          ammo: ammoLogEntry(ammo, {
            ablated: 0,
            heldAtOne: outcome.heldAtOne,
            injurySuppressed: request.criticalInjury && ammo.noCriticalInjury === true,
          }),
        }
      : {}),
  };
  // Rany krytycznej nie ma gdzie zapisać, więc zostaje zdanie — jedyna droga,
  // którą stół dowiaduje się, że dwie szóstki padły (błąd #6 z 08.08).
  if (outcome.criticalInjury) {
    log.injuryNote = 'Figura bez karty — ranę krytyczną rozstrzyga MG.';
  }
  if (request.aimedAt && request.aimedAt !== 'head' && outcome.damageThrough > 0) {
    log.aimedAt = CPRED_AIM_POINT_LABELS[request.aimedAt];
    log.aimNote =
      request.aimedAt === 'heldItem'
        ? 'Cel upuszcza trzymany przedmiot (wybór atakującego) — pada na ziemię przed nim.'
        : 'Cel bez karty postaci — „Złamaną nogę" rozegraj ręcznie.';
  }
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
  const max = cpredSheetHpMax(data);
  const patch: Partial<CpredCharacterData> = {};
  if (entry.hp) patch.hpCurrent = entry.hp.before;
  if (entry.armor) {
    patch.armor = data.armor.map((row) =>
      row.id === entry.armor!.rowId ? { ...row, spCurrent: entry.armor!.before } : row,
    );
  }
  // Remove one instance of each wound this hit added, not every injury of that
  // id. Two of them when a dumdum round chewed its way in (stage 16g), and a
  // third when an aimed leg shot broke the leg on top of the draw (s. 170).
  const drawn = [entry.injury?.id, entry.injuryExtra?.id, entry.injuryAimed?.id].filter(
    (id): id is string => id !== undefined,
  );
  if (drawn.length > 0) {
    let remaining = [...data.criticalInjuries];
    for (const injuryId of drawn) {
      const index = remaining.findIndex((row) => row.id === injuryId);
      if (index >= 0) remaining = remaining.filter((_, position) => position !== index);
    }
    patch.criticalInjuries = remaining;
  }
  const merged = mergeCharacterData(data, patch);
  return { data: JSON.stringify(merged), hp: { current: merged.hpCurrent, max } };
}
