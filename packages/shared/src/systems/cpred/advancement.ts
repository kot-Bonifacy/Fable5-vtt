/**
 * Punkty Doświadczenia (stage 29a, s. 408–411) — the thing that makes a
 * character after ten sessions somebody other than the one the wizard printed.
 *
 * Until this stage the sheet had a number field called „Punkty Doświadczenia"
 * and whoever owned the sheet typed into it, exactly the way it had a number
 * field for eddies until stage 23b. The bargain here is the same one 23b made:
 * **a pool is written by the server or not at all**, and so is anything bought
 * out of it. What a player may spend a point *on* stays a conversation at the
 * table (s. 411); what a point *costs* stops being one.
 *
 * Three ladders, not one. The rulebook prints them side by side on s. 411 and
 * they are genuinely different tables:
 *
 *  - an ordinary Skill: 20, 40, 60 … 200
 *  - a ×2 Skill (seven of them, and `multiplier` in `skills.json` has said which
 *    since stage 25a): 40, 80, 120 … 400
 *  - a Special Ability, the same for all ten Roles: 60, 120, 180 … 600
 *
 * The price is always the price of the level being **entered**, never of the one
 * being left: „należy wydać tyle Punktów Doświadczenia, ile widnieje w rubryce
 * przy kolejnym (docelowym) poziomie".
 */

import {
  ROLE_RANK_MAX,
  SKILL_LEVEL_MAX,
  cpredSkillLabel,
  type CpredCharacterData,
  type CpredRegistry,
} from './character.js';
import {
  CPRED_MULTICLASS_MIN_RANK,
  cpredHasRole,
  cpredRoleRanks,
  type CpredRoleRank,
  type CpredRoleSheet,
} from './roleability.js';

/**
 * „KOSZT AWANSU UMIEJĘTNOŚCI ZWYKŁYCH" (s. 411), indexed by target level − 1.
 *
 * Written out rather than computed as `level × 20`: all three tables are
 * arithmetic today, and one that stops being arithmetic in a supplement would
 * then need a rewrite instead of an edit.
 */
export const CPRED_SKILL_ADVANCE_COSTS: readonly number[] = [
  20, 40, 60, 80, 100, 120, 140, 160, 180, 200,
];

/** „KOSZT AWANSU ZDOLNOŚCI SPECJALNEJ" (s. 411) — one table for all ten Roles. */
export const CPRED_ABILITY_ADVANCE_COSTS: readonly number[] = [
  60, 120, 180, 240, 300, 360, 420, 480, 540, 600,
];

/**
 * What one level of a Skill costs, or null when there is no such level.
 *
 * `multiplier` is the ×2 column and comes straight off the registry row — the
 * rulebook has exactly two columns, so anything other than 2 is read as 1 and a
 * data file with `multiplier: 3` prices a skill the book cannot describe.
 */
export function cpredSkillAdvanceCost(target: number, multiplier?: number): number | null {
  const base = CPRED_SKILL_ADVANCE_COSTS[Math.round(target) - 1];
  if (base === undefined) return null;
  return multiplier === 2 ? base * 2 : base;
}

/** What one level of a Special Ability costs, or null when there is no such level. */
export function cpredAbilityAdvanceCost(target: number): number | null {
  return CPRED_ABILITY_ADVANCE_COSTS[Math.round(target) - 1] ?? null;
}

/** What is being raised: a Skill row, or the Role's Special Ability. */
export type CpredAdvanceKind = 'skill' | 'ability';

/**
 * One purchase, as the client asks for it.
 *
 * `to` travels with the request on purpose, rather than being read as
 * „current + 1" on the server: two clicks racing each other would otherwise buy
 * two levels for the price the panel showed once. With the target named, the
 * second request finds the level already reached and is refused.
 */
export interface CpredAdvanceRequest {
  kind: CpredAdvanceKind;
  /** Registry skill id; unread for `ability`. */
  skillId?: string;
  /**
   * Which Role's Special Ability is being raised; unread for `skill`, and
   * absent means the current one.
   *
   * Stage 29b: a sheet may carry several, and „cały czas możesz podnosić
   * poziom Zdolności Specjalnej poprzedniej Roli" (s. 143) means a former Role
   * is bought up the same ladder as the current one — so the request has to
   * say which, for the same reason `to` does.
   */
  roleId?: string;
  /** Level being entered — must be exactly one above the current one. */
  to: number;
}

export type CpredAdvanceProblem =
  'BAD_REQUEST' | 'UNKNOWN_SKILL' | 'NO_ROLE' | 'LEVEL_MAX' | 'LEVEL_SKIP' | 'NO_POINTS';

export const CPRED_ADVANCE_PROBLEMS: Record<CpredAdvanceProblem, string> = {
  BAD_REQUEST: 'Nie wiadomo, co miałoby wzrosnąć.',
  UNKNOWN_SKILL: 'Nie ma takiej Umiejętności.',
  NO_ROLE: 'Ta postać nie ma Roli, więc nie ma Zdolności Specjalnej do podniesienia.',
  LEVEL_MAX: 'To już najwyższy poziom.',
  LEVEL_SKIP: 'Poziomów nie można przeskakiwać — następny jest o jeden wyżej.',
  NO_POINTS: 'Za mało Punktów Doświadczenia.',
};

/** What the sheet has to show for an advance to be priced and judged. */
export type CpredAdvanceSheet = Pick<
  CpredCharacterData,
  | 'skills'
  | 'skillSpecialties'
  | 'lifepath'
  | 'roleId'
  | 'roleAbilityRank'
  | 'formerRoles'
  | 'improvementPoints'
>;

/** One priced step up, whether it can be paid for or not. */
export interface CpredAdvanceStep {
  kind: CpredAdvanceKind;
  /** Registry skill id, or null for the Special Ability. */
  skillId: string | null;
  /** Registry role id whose Ability rises, or null for a Skill (stage 29b). */
  roleId: string | null;
  /** As the audit will name it: „Percepcja", „Nauka (Fizyka)", „Zmysł Walki". */
  name: string;
  from: number;
  to: number;
  cost: number;
  /** A ×2 Skill — the panel says so, because the price is otherwise a surprise. */
  doubled: boolean;
}

/** A step, plus what it leaves in the purse. */
export interface CpredAdvancePlan extends CpredAdvanceStep {
  /** Points left after paying. */
  left: number;
}

export type CpredAdvanceResult =
  { ok: true; plan: CpredAdvancePlan } | { ok: false; problem: CpredAdvanceProblem };

/**
 * The next step up of one Skill, or null when it already stands at ten.
 *
 * A skill absent from `skills` steps to 1 — „lub wykupywać nowe Umiejętności"
 * (s. 408) is bought off the same ladder, at its first rung.
 */
export function cpredSkillAdvanceStep(
  data: Pick<CpredAdvanceSheet, 'skills' | 'skillSpecialties' | 'lifepath'>,
  skill: { id: string; name: string; multiplier?: number },
): CpredAdvanceStep | null {
  const from = Math.max(0, Math.round(data.skills[skill.id] ?? 0));
  const to = from + 1;
  if (to > SKILL_LEVEL_MAX) return null;
  const cost = cpredSkillAdvanceCost(to, skill.multiplier);
  if (cost === null) return null;
  return {
    kind: 'skill',
    skillId: skill.id,
    roleId: null,
    name: cpredSkillLabel(skill, data),
    from,
    to,
    cost,
    doubled: skill.multiplier === 2,
  };
}

/**
 * The next step up of the Special Ability, or null when there is no Role or it
 * already stands at ten.
 *
 * The ability is named off the registry row, like everywhere else in stage 30:
 * ids come from `roles.json`, and a group that renames one must not lose the
 * audit line saying what they bought.
 */
export function cpredAbilityAdvanceStep(
  data: CpredRoleSheet,
  registry: CpredRegistry,
  roleId?: string,
): CpredAdvanceStep | null {
  const wanted = roleId ?? data.roleId;
  if (!wanted) return null;
  const row = cpredRoleRanks(data).find((entry) => entry.roleId === wanted);
  if (!row) return null;
  const role = registry.roles.find((entry) => entry.id === wanted);
  if (!role) return null;
  const from = row.rank;
  const to = from + 1;
  if (to > ROLE_RANK_MAX) return null;
  const cost = cpredAbilityAdvanceCost(to);
  if (cost === null) return null;
  return {
    kind: 'ability',
    skillId: null,
    roleId: wanted,
    name: role.ability,
    from,
    to,
    cost,
    doubled: false,
  };
}

/**
 * Every Special Ability this sheet may still raise, current Role first.
 *
 * The panel's list rather than one row, because from stage 29b a sheet may
 * carry three — and „nie możesz przeskakiwać Poziomów" is per ability, so a
 * Solo whose Zmysł Walki stands at ten still has a Moto to buy.
 */
export function cpredAbilityAdvanceSteps(
  data: CpredRoleSheet,
  registry: CpredRegistry,
): CpredAdvanceStep[] {
  return cpredRoleRanks(data)
    .map((row) => cpredAbilityAdvanceStep(data, registry, row.roleId))
    .filter((step): step is CpredAdvanceStep => step !== null);
}

/**
 * Judges and prices one purchase — the single function the server and the panel
 * both go through, so a greyed-out button and a refused event never disagree.
 */
export function planCpredAdvance(
  data: CpredAdvanceSheet,
  registry: CpredRegistry,
  request: CpredAdvanceRequest,
): CpredAdvanceResult {
  const to = typeof request?.to === 'number' ? Math.round(request.to) : Number.NaN;
  if (!Number.isInteger(to)) return { ok: false, problem: 'BAD_REQUEST' };

  let step: CpredAdvanceStep | null;
  if (request.kind === 'ability') {
    // Stage 29b: an absent `roleId` still means the current Role, so every
    // client written before multiclassing keeps buying the same level.
    const wanted = request.roleId ?? data.roleId;
    if (!wanted || !cpredHasRole(data, wanted) || !registry.roles.some((e) => e.id === wanted)) {
      return { ok: false, problem: 'NO_ROLE' };
    }
    step = cpredAbilityAdvanceStep(data, registry, wanted);
    // The Role is known, so the only way back is null is a rank out of ladder.
    if (step === null) return { ok: false, problem: 'LEVEL_MAX' };
  } else if (request.kind === 'skill') {
    const skill = registry.skills.find((entry) => entry.id === request.skillId);
    if (!skill) return { ok: false, problem: 'UNKNOWN_SKILL' };
    step = cpredSkillAdvanceStep(data, skill);
    if (step === null) return { ok: false, problem: 'LEVEL_MAX' };
  } else {
    return { ok: false, problem: 'BAD_REQUEST' };
  }

  // „Nie możesz przeskakiwać Poziomów" (s. 411). The refusal lives here rather
  // than in the form, because the form is not the only caller — and because a
  // second click on the same button arrives as exactly this case.
  if (to !== step.to) return { ok: false, problem: 'LEVEL_SKIP' };
  const left = Math.round(data.improvementPoints) - step.cost;
  if (left < 0) return { ok: false, problem: 'NO_POINTS' };
  return { ok: true, plan: { ...step, left } };
}

/**
 * The sheet fields one bought step writes — the level, or the rank, never both.
 *
 * Stage 29b: a sheet may carry several Roles, and the rank of a former one
 * lives on its own row. Which of the two boxes moves is decided here rather
 * than by the request — the planner has already said which Role this is.
 */
export function cpredAdvanceSheetPatch(
  step: CpredAdvanceStep,
  data: Pick<CpredCharacterData, 'skills' | 'roleId' | 'formerRoles'>,
): Partial<CpredCharacterData> {
  if (step.kind === 'ability') {
    if (step.roleId !== null && step.roleId !== data.roleId) {
      return {
        formerRoles: data.formerRoles.map((entry) =>
          entry.roleId === step.roleId ? { ...entry, rank: step.to } : entry,
        ),
      };
    }
    return { roleAbilityRank: step.to };
  }
  return { skills: { ...data.skills, [step.skillId as string]: step.to } };
}

/** Most steps one „Zatwierdź zmiany" may carry — a guard, not a rule. */
export const CPRED_ADVANCE_BATCH_MAX = 100;

export type CpredAdvanceBatchResult<T extends CpredAdvanceSheet> =
  | { ok: true; plans: CpredAdvancePlan[]; sheet: T }
  | { ok: false; problem: CpredAdvanceProblem; index: number };

/**
 * Judges a whole basket of purchases against one sheet, each step priced on the
 * sheet the previous ones left (zlecenie MG z 24.10.2026: gracz klika
 * „Podnieś" do woli, a PD odchodzą dopiero przy „Zatwierdź zmiany").
 *
 * The panel previews the basket with this and the server applies it with this,
 * so Percepcja 4 → 5 → 6 is two steps both sides agree on, and a basket one
 * point too dear is refused whole — never half-bought.
 */
export function planCpredAdvances<T extends CpredAdvanceSheet>(
  data: T,
  registry: CpredRegistry,
  requests: readonly CpredAdvanceRequest[],
): CpredAdvanceBatchResult<T> {
  if (!Array.isArray(requests) || requests.length > CPRED_ADVANCE_BATCH_MAX) {
    return { ok: false, problem: 'BAD_REQUEST', index: 0 };
  }
  let sheet = data;
  const plans: CpredAdvancePlan[] = [];
  for (const [index, request] of requests.entries()) {
    const result = planCpredAdvance(sheet, registry, request);
    if (!result.ok) return { ok: false, problem: result.problem, index };
    plans.push(result.plan);
    sheet = {
      ...sheet,
      ...cpredAdvanceSheetPatch(result.plan, sheet),
      improvementPoints: result.plan.left,
    };
  }
  return { ok: true, plans, sheet };
}

// ─────────────────────────── Zmiana Roli (s. 143) ───────────────────────────

export type CpredRoleChangeProblem =
  'BAD_REQUEST' | 'UNKNOWN_ROLE' | 'NO_ROLE' | 'SAME_ROLE' | 'RANK_TOO_LOW' | 'NO_POINTS';

export const CPRED_ROLE_CHANGE_PROBLEMS: Record<CpredRoleChangeProblem, string> = {
  BAD_REQUEST: 'Nie wiadomo, jaką Rolą miałaby być ta postać.',
  UNKNOWN_ROLE: 'Nie ma takiej Roli.',
  NO_ROLE: 'Ta postać nie ma jeszcze Roli — pierwszą nadaje kreator albo MG.',
  SAME_ROLE: 'To już jest bieżąca Rola tej postaci.',
  RANK_TOO_LOW: `Rolę zmienia się dopiero przy Zdolności Specjalnej bieżącej Roli na poziomie ${CPRED_MULTICLASS_MIN_RANK} (s. 143).`,
  NO_POINTS: 'Za mało Punktów Doświadczenia.',
};

/** One change of Role, priced and judged. */
export interface CpredRoleChangePlan {
  /** Role being taken up — the one the Street will see. */
  roleId: string;
  /** Its printed name, for the button and the audit row. */
  roleName: string;
  /** Its Special Ability's printed name. */
  ability: string;
  /** Rank it stands at afterwards: 1 for a new Role, the kept one on a return. */
  rank: number;
  /** True when the sheet already carried this Role — then the change is free. */
  returning: boolean;
  cost: number;
  /** Points left after paying. */
  left: number;
  /** The Role stepping aside, and how far its Ability had come. */
  from: CpredRoleRank;
}

export type CpredRoleChangeResult =
  { ok: true; plan: CpredRoleChangePlan } | { ok: false; problem: CpredRoleChangeProblem };

/** What judging a change of Role needs off a sheet. */
export type CpredRoleChangeSheet = CpredRoleSheet & Pick<CpredCharacterData, 'improvementPoints'>;

/**
 * Judges and prices one change of Role — the twin of `planCpredAdvance`, and
 * the single function both the panel and the server go through.
 *
 * „W Czasie Czerwieni możesz zmienić Rolę zawsze, gdy poziom Zdolności
 * Specjalnej poprzedniej Roli wynosi co najmniej 4" (s. 143). The gate always
 * asks the **current** Role, which is what makes the third Role ask the second
 * rather than the first: „dopóki nie podniesiesz poziomu Zdolności Specjalnej
 * swojej nowej Roli do 4".
 *
 * Two shapes come out of one rule. Taking up a Role never held before buys its
 * Ability's first rung (60 PD, s. 411) and starts at 1; going back to one the
 * sheet already carries costs nothing, because the rank is still there and the
 * only thing changing is which Role the Street sees (decision of the GM,
 * 30.08.2026).
 */
export function planCpredRoleChange(
  data: CpredRoleChangeSheet,
  registry: CpredRegistry,
  roleId: unknown,
): CpredRoleChangeResult {
  if (typeof roleId !== 'string' || roleId.length === 0) {
    return { ok: false, problem: 'BAD_REQUEST' };
  }
  const role = registry.roles.find((entry) => entry.id === roleId);
  if (!role) return { ok: false, problem: 'UNKNOWN_ROLE' };

  const current = cpredRoleRanks(data)[0];
  if (!current || !registry.roles.some((entry) => entry.id === current.roleId)) {
    return { ok: false, problem: 'NO_ROLE' };
  }
  if (current.roleId === roleId) return { ok: false, problem: 'SAME_ROLE' };
  if (current.rank < CPRED_MULTICLASS_MIN_RANK) return { ok: false, problem: 'RANK_TOO_LOW' };

  const former: readonly CpredRoleRank[] = data.formerRoles ?? [];
  const held = former.find((entry) => entry.roleId === roleId) ?? null;
  const returning = held !== null;
  const cost = returning ? 0 : (cpredAbilityAdvanceCost(1) ?? 0);
  const left = Math.round(data.improvementPoints) - cost;
  if (left < 0) return { ok: false, problem: 'NO_POINTS' };

  return {
    ok: true,
    plan: {
      roleId,
      roleName: role.name,
      ability: role.ability,
      rank: held ? Math.max(1, Math.round(held.rank)) : 1,
      returning,
      cost,
      left,
      from: current,
    },
  };
}

/**
 * The sheet fields one change of Role writes — the current Role and the list of
 * former ones, always together. Pure, so the server merges the result of the
 * same computation the panel previewed.
 */
export function cpredRoleChangeSheet(
  data: CpredRoleSheet,
  plan: CpredRoleChangePlan,
): Pick<CpredCharacterData, 'roleId' | 'roleAbilityRank' | 'formerRoles'> {
  const former: readonly CpredRoleRank[] = data.formerRoles ?? [];
  const formerRoles = former.filter((entry) => entry.roleId !== plan.roleId);
  formerRoles.unshift({ roleId: plan.from.roleId, rank: Math.max(1, plan.from.rank) });
  return { roleId: plan.roleId, roleAbilityRank: plan.rank, formerRoles };
}

/** „Nomada — nowa Rola (Moto 1)" — what the audit row says about the change. */
export function describeCpredRoleChange(plan: CpredRoleChangePlan): string {
  const what = plan.returning ? 'powrót do Roli' : 'nowa Rola';
  return `${plan.roleName} — ${what} (${plan.ability} ${plan.rank})`;
}

// ─────────────────────────── Rejestr awansów ───────────────────────────

/**
 * What a row of the advancement ledger is for.
 *
 * A twin of `LedgerKind` from 23b, and deliberately not the same list: money
 * and experience are audits of two different things, and one shared enum would
 * make „Zakup" a legal reason for a point of Percepcja.
 */
export const ADVANCEMENT_KINDS = ['award', 'spend', 'adjust', 'role', 'undo'] as const;
export type AdvancementKind = (typeof ADVANCEMENT_KINDS)[number];

export const ADVANCEMENT_KIND_LABELS: Record<AdvancementKind, string> = {
  award: 'Przyznane po sesji',
  spend: 'Awans',
  adjust: 'Korekta MG',
  // Stage 29b. Its own kind rather than a `spend` of nought, because a return
  // to a Role already held moves no points at all — and „Awans: 0 PD" is a row
  // that reads like a bug.
  role: 'Zmiana Roli',
  // 24.10.2026: the GM took a row back. Its own row rather than a deleted one,
  // because the ledger is an audit — „skąd te PD" must still be answerable.
  undo: 'Cofnięte przez MG',
};

export function isAdvancementKind(value: unknown): value is AdvancementKind {
  return typeof value === 'string' && (ADVANCEMENT_KINDS as readonly string[]).includes(value);
}

/** One line of the advancement audit, as the client sees it. */
export interface AdvancementEntryView {
  id: number;
  kind: AdvancementKind;
  /** Signed: negative is points leaving the character. */
  amount: number;
  /** Points left *after* the operation — the audit outlives later sheet edits. */
  balance: number;
  /** Polish one-liner: „Percepcja 4 → 5", „Sesja 30.08". */
  label: string;
  createdAt: string;
  /** The GM took this row back (24.10.2026). */
  undone: boolean;
  /**
   * GM only: whether „Cofnij" would go through right now, or why not — absent
   * for the player, who undoes nothing.
   */
  undo?: 'ok' | AdvancementUndoProblem;
}

// ─────────────────────────── Cofanie wpisu (24.10.2026) ───────────────────────────

/** The three role fields a change of Role writes together. */
export type CpredRoleState = Pick<CpredCharacterData, 'roleId' | 'roleAbilityRank' | 'formerRoles'>;

/**
 * What a ledger row remembers about the sheet, so the GM can take it back
 * (zlecenie MG z 24.10.2026). Rows written before this have none, and a bought
 * level among them cannot be undone — only corrected by hand.
 */
export type AdvancementRevert =
  | {
      type: 'advance';
      kind: CpredAdvanceKind;
      skillId: string | null;
      roleId: string | null;
      from: number;
      to: number;
    }
  | { type: 'role'; before: CpredRoleState; after: CpredRoleState };

export function cpredRoleState(data: CpredRoleState): CpredRoleState {
  return {
    roleId: data.roleId,
    roleAbilityRank: data.roleAbilityRank,
    formerRoles: data.formerRoles.map((entry) => ({ ...entry })),
  };
}

/** What a bought step leaves for its undo. */
export function advancementRevertOf(step: CpredAdvanceStep): AdvancementRevert {
  return {
    type: 'advance',
    kind: step.kind,
    skillId: step.skillId,
    roleId: step.roleId,
    from: step.from,
    to: step.to,
  };
}

/** Reads the stored column leniently — anything malformed is „nie pamięta". */
export function readAdvancementRevert(raw: string | null): AdvancementRevert | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AdvancementRevert> | null;
    if (value?.type === 'advance' || value?.type === 'role') return value as AdvancementRevert;
  } catch {
    // Malformed — read as a row that remembers nothing.
  }
  return null;
}

export type AdvancementUndoProblem =
  'UNDO_DONE' | 'UNDO_KIND' | 'UNDO_UNKNOWN' | 'UNDO_STALE' | 'UNDO_SPENT';

export const ADVANCEMENT_UNDO_PROBLEMS: Record<AdvancementUndoProblem, string> = {
  UNDO_DONE: 'Ten wpis już cofnięto.',
  UNDO_KIND: 'Cofnięcia się nie cofa — przyznaj PD albo popraw kartę ręką.',
  UNDO_UNKNOWN: 'Ten wpis powstał, zanim rejestr zaczął pamiętać, co zmienił — popraw kartę ręką.',
  UNDO_STALE: 'Od tego wpisu poziom się zmienił — najpierw cofnij późniejszy awans.',
  UNDO_SPENT: 'Postać wydała już te PD — najpierw cofnij jej późniejsze awanse.',
};

/** One ledger row as undoing it needs to see it. */
export interface AdvancementUndoEntry {
  kind: string;
  amount: number;
  revert: AdvancementRevert | null;
  undone: boolean;
}

/** What taking one row back writes: points the other way, and the old sheet. */
export interface AdvancementUndoPlan {
  /** Signed, the opposite of the row's. */
  amount: number;
  sheet: Partial<CpredCharacterData>;
}

export type AdvancementUndoResult =
  { ok: true; plan: AdvancementUndoPlan } | { ok: false; problem: AdvancementUndoProblem };

function sameRoleState(a: CpredRoleState, b: CpredRoleState): boolean {
  return JSON.stringify(cpredRoleState(a)) === JSON.stringify(cpredRoleState(b));
}

/**
 * Judges taking one ledger row back (zlecenie MG z 24.10.2026).
 *
 * A bought level goes back only while the sheet still stands where the row
 * left it: Percepcja 4 → 5 under a later 5 → 6 would otherwise drop the
 * character to 4 and keep the price of the sixth. Points handed out go back
 * only while they are still in the pool — the GM undoes the purchases first.
 */
export function planAdvancementUndo(
  data: CpredRoleState & Pick<CpredCharacterData, 'skills' | 'improvementPoints'>,
  entry: AdvancementUndoEntry,
): AdvancementUndoResult {
  if (entry.undone) return { ok: false, problem: 'UNDO_DONE' };
  if (!isAdvancementKind(entry.kind) || entry.kind === 'undo') {
    return { ok: false, problem: 'UNDO_KIND' };
  }
  const amount = -entry.amount;
  if (Math.round(data.improvementPoints) + amount < 0) return { ok: false, problem: 'UNDO_SPENT' };
  if (entry.kind === 'award' || entry.kind === 'adjust') {
    return { ok: true, plan: { amount, sheet: {} } };
  }

  const revert = entry.revert;
  if (entry.kind === 'role') {
    if (revert?.type !== 'role') return { ok: false, problem: 'UNDO_UNKNOWN' };
    if (!sameRoleState(data, revert.after)) return { ok: false, problem: 'UNDO_STALE' };
    return { ok: true, plan: { amount, sheet: cpredRoleState(revert.before) } };
  }

  if (revert?.type !== 'advance') return { ok: false, problem: 'UNDO_UNKNOWN' };
  if (revert.kind === 'skill') {
    const id = revert.skillId ?? '';
    if (Math.round(data.skills[id] ?? 0) !== revert.to) return { ok: false, problem: 'UNDO_STALE' };
    return { ok: true, plan: { amount, sheet: { skills: { ...data.skills, [id]: revert.from } } } };
  }
  if (revert.roleId === null || revert.roleId === data.roleId) {
    if (data.roleAbilityRank !== revert.to) return { ok: false, problem: 'UNDO_STALE' };
    return { ok: true, plan: { amount, sheet: { roleAbilityRank: revert.from } } };
  }
  const former = data.formerRoles.find((row) => row.roleId === revert.roleId);
  if (!former || former.rank !== revert.to) return { ok: false, problem: 'UNDO_STALE' };
  return {
    ok: true,
    plan: {
      amount,
      sheet: {
        formerRoles: data.formerRoles.map((row) =>
          row.roleId === revert.roleId ? { ...row, rank: revert.from } : row,
        ),
      },
    },
  };
}

/** „Cofnięte: Percepcja 4 → 5" — the label of the row an undo writes. */
export function describeAdvancementUndo(label: string): string {
  return `Cofnięte: ${label}`.slice(0, ADVANCEMENT_LABEL_MAX);
}

/** „−80 PD" / „+50 PD" — the amount column of the audit list. */
export function formatAdvancementAmount(amount: number): string {
  const sign = amount < 0 ? '−' : '+';
  return `${sign}${Math.abs(amount)} PD`;
}

/** „Percepcja 4 → 5" — what the audit row says a purchase bought. */
export function describeCpredAdvance(step: CpredAdvanceStep): string {
  return `${step.name} ${step.from} → ${step.to}`;
}

/**
 * Pola karty, które rozwijają postać poza Awansem i zmianą Roli (zlecenie MG
 * z 21.10.2026): rozdział Specjalizacji Medyka i Technika, Tabor Nomady oraz
 * Zakwaterowanie z Poziomem życia. W walce gracz ich nie zmienia — serwer pyta
 * tę funkcję o łatę `character:update` **scaloną** z kartą, bo klient może
 * odesłać pole bez zmian (autozapis) i taka łata ma przejść.
 */
export type CpredDevelopmentSheet = Pick<
  CpredCharacterData,
  'medicine' | 'fabrication' | 'fleet' | 'lifestyle'
>;

export function cpredDevelopmentChanged(
  before: CpredDevelopmentSheet,
  after: CpredDevelopmentSheet,
): boolean {
  // Zero i brak wpisu to ten sam rozdział; kolejność kluczy nie ma znaczenia.
  const sameAllocation = (a: Partial<Record<string, number>>, b: Partial<Record<string, number>>) =>
    [...Object.keys(a), ...Object.keys(b)].every((id) => (a[id] ?? 0) === (b[id] ?? 0));
  // Uwagi przy wpisie Taboru to notatka gracza, nie wybór z awansu.
  const fleet = (sheet: CpredDevelopmentSheet) =>
    JSON.stringify(sheet.fleet.map((row) => [row.id, row.kind, row.name, row.level]));
  return (
    !sameAllocation(before.medicine, after.medicine) ||
    !sameAllocation(before.fabrication, after.fabrication) ||
    fleet(before) !== fleet(after) ||
    before.lifestyle?.level !== after.lifestyle?.level ||
    before.lifestyle?.housing !== after.lifestyle?.housing
  );
}

/** Longest reason the GM may type on an award: a label, not a journal entry. */
export const ADVANCEMENT_LABEL_MAX = 80;

/**
 * Most points one award may hand out. The table on s. 410–411 stops at 80 per
 * session, so this is a guard against a typed zero too many, not a rule.
 */
export const ADVANCEMENT_AWARD_MAX = 1000;

/** Default reason on an award the GM did not name — the audit says something. */
export const ADVANCEMENT_AWARD_LABEL = 'po sesji';

// ─────────────────────────── Kształt zdarzeń ───────────────────────────

/**
 * Client → server payload of `character:advance` — one level, paid for.
 *
 * The owner of the sheet sends it, or the GM (decision of the GM, 30.08.2026:
 * „gracz wydaje sam"). Everything deciding whether it is legal is on the server
 * already; the request only names what is being bought.
 *
 * These wire shapes live beside the ladders rather than in `protocol.ts` for
 * the reason the whole `systems/cpred` folder exists: „ile kosztuje poziom
 * Percepcji" is a rule of one game system, and the VTT core has to stay able to
 * host another one.
 */
export interface CharacterAdvancePayload extends Partial<CpredAdvanceRequest> {
  characterId: string;
  /**
   * A basket of purchases (zlecenie MG z 24.10.2026), applied in order and all
   * or nothing. When present, the single-step fields are unread.
   */
  steps?: CpredAdvanceRequest[];
}

/** GM only: `character:xp-undo` — takes one ledger row back (24.10.2026). */
export interface CharacterXpUndoPayload {
  characterId: string;
  entryId: number;
}

/**
 * GM only: `character:xp-award` — the pool after a session (s. 410).
 *
 * „Po każdej sesji gry MG przyznaje **wszystkim** graczom Punkty Doświadczenia"
 * is why `everyone` exists: the post-session ritual hands out one number to the
 * whole table, and doing that a sheet at a time is how a GM forgets somebody.
 */
export interface CharacterXpAwardPayload {
  /** One character; unread when `everyone` is set. */
  characterId?: string;
  /** Every player-owned character in the campaign — the usual case. */
  everyone?: boolean;
  /** Points handed out; may be negative when the GM is taking some back. */
  amount: number;
  /** Why, for the audit: „sesja 30.08", „styl gry: Aktor". */
  label?: string;
}

export interface CharacterXpAwardResult {
  /** How many sheets the points reached. */
  awarded: number;
}

/**
 * PD the GM handed one character and its owner has not been told about yet
 * (decision of the GM, 20.10.2026: „gracz dostaje komunikat o przydzieleniu").
 *
 * Only awards — a correction or points taken back say nothing. Several awards
 * the owner missed while away add up into one notice per character.
 */
export interface XpAwardNotice {
  characterId: string;
  characterName: string;
  /** Sum of the awards not shown yet. */
  amount: number;
  /** Their reasons, oldest first, each once. */
  labels: string[];
  /** Points in the pool now — what the player can spend. */
  available: number;
}

/**
 * Server → owner: `character:xp-awarded`, pushed when the award lands and the
 * owner is connected. Also the answer to `character:xp-unseen`, which a
 * player's client asks after every `state:sync` for what it missed.
 */
export interface CharacterXpAwardedPush {
  awards: XpAwardNotice[];
}

/** „MG przyznał 50 PD postaci Marek (sesja 20.10). Do wydania: 120 PD." */
export function describeXpAwardNotice(notice: XpAwardNotice): string {
  // „postaci X", not „Markowi": a nickname has no declension the VTT knows.
  const why = notice.labels.length > 0 ? ` (${notice.labels.join('; ')})` : '';
  return (
    `MG przyznał ${notice.amount} PD postaci ${notice.characterName}${why}. ` +
    `Do wydania: ${notice.available} PD.`
  );
}

/**
 * `character:role-change` — the sheet takes up another Role (stage 29b).
 *
 * Its own event rather than a field of `character:update` for the reason
 * `eddies` left that path in 23b: a new Role costs 60 PD and is gated on a
 * rank, and a door that reaches the same result without paying either makes
 * both decoration. The owner of the sheet sends it, or the GM.
 */
export interface CharacterRoleChangePayload {
  characterId: string;
  /** Registry role id the character becomes. */
  roleId: string;
}

/** Client → server payload of `character:xp-history` — the audit of one sheet. */
export interface CharacterXpHistoryPayload {
  characterId: string;
}

export interface CharacterXpHistoryResult {
  entries: AdvancementEntryView[];
}
