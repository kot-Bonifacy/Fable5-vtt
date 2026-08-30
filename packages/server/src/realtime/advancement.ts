import type {
  AdvancementKind,
  CharacterAdvancePayload,
  CharacterRoleChangePayload,
  CharacterView,
  CharacterXpAwardPayload,
  CharacterXpAwardResult,
  CharacterXpHistoryPayload,
  CharacterXpHistoryResult,
  CpredAdvanceStep,
  CpredCharacterData,
} from '@vtt/shared';
import {
  ADVANCEMENT_AWARD_MAX,
  ADVANCEMENT_AWARD_LABEL,
  ADVANCEMENT_LABEL_MAX,
  IMPROVEMENT_POINTS_MAX,
  ROLE_GM,
  describeCpredAdvance,
  isAdvancementKind,
  cpredRoleChangeSheet,
  describeCpredRoleChange,
  mergeCharacterData,
  parseCharacterData,
  planCpredAdvance,
  planCpredRoleChange,
} from '@vtt/shared';
import type { Character } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { emitRuns } from './netrun-io.js';
import { emitTokensOfCharacter } from './tokens.js';

/**
 * Punkty Doświadczenia (stage 29a, s. 408–411).
 *
 * The rule this module exists to enforce is the one `economy.ts` wrote down for
 * eddies in 23b, one word changed: **a pool of PD is written by the server or
 * not at all**, and so is every level bought out of it. Until this stage the
 * sheet had a number box and whoever owned the sheet typed into it, which made
 * „skąd wziął się ten poziom Percepcji" unanswerable one session later.
 *
 * Three paths reach the box and each leaves a row naming itself:
 *
 *  - `character:advance` — the player spends, on a ladder the server prices
 *  - `character:xp-award` — the GM hands out the post-session pool
 *  - the GM's own number field on the sheet, which lands here as a correction
 *
 * What the GM keeps beside all three is the *sheet*: levels and the Special
 * Ability rank stay editable for the GM alone (`character:update`), because a
 * referee has to be able to fix a card. What the player loses is exactly the
 * back door — for them the only way up is through the price.
 */

/** Rows the panel asks for; the audit list is short by design, as in 23b. */
const ADVANCEMENT_PAGE_SIZE = 30;

/**
 * A GM correction typed a digit at a time would fill the audit with „500 →
 * 50 → 5". Within this window the same GM's correction of the same sheet is
 * rewritten instead of appended, so the list holds one row per intention.
 */
const ADJUST_MERGE_MS = 60_000;

/** What one write to the PD box has to say for itself. */
export interface AdvancementChange {
  kind: AdvancementKind;
  /** Signed: negative is points leaving the character. */
  amount: number;
  /** Polish one-liner for the audit: „Percepcja 4 → 5", „po sesji". */
  label: string;
}

/** The box may not hold an absurd number, and never a negative one. */
function clampPoints(value: number): number {
  return Math.max(0, Math.min(IMPROVEMENT_POINTS_MAX, Math.round(value)));
}

/**
 * Moves the PD box and records why, in that order and never one without the
 * other — the twin of `applyBalance`. Returns the sheet as saved, so callers
 * read the new total without a second query.
 *
 * `sheet` carries whatever else the same write changes (the new skill level,
 * the new rank): a purchase is one save, so an advance and its price can never
 * be half-applied.
 */
export async function applyImprovementPoints(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  data: CpredCharacterData,
  change: AdvancementChange,
  actorId: string,
  options: { merge?: boolean; emit?: boolean; sheet?: Partial<CpredCharacterData> } = {},
): Promise<CpredCharacterData> {
  const balance = clampPoints(data.improvementPoints + change.amount);
  const updated = mergeCharacterData(data, {
    ...options.sheet,
    improvementPoints: balance,
  });
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: JSON.stringify(updated) },
  });

  const previous = options.merge ? await lastMergeableAdjust(deps, character.id, actorId) : null;
  if (previous) {
    await deps.ctx.prisma.advancementEntry.update({
      where: { id: previous.id },
      data: {
        // The merged row keeps its original „before", so the amount stays the
        // truth of the whole edit rather than of its last keystroke.
        amount: balance - (previous.balance - previous.amount),
        balance,
        label: change.label,
      },
    });
  } else {
    await deps.ctx.prisma.advancementEntry.create({
      data: {
        campaignId,
        characterId: character.id,
        kind: change.kind,
        amount: change.amount,
        balance,
        label: change.label,
        actorId,
      },
    });
  }

  if (options.emit !== false) {
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    // The sheet is the token's source of truth (stage 08), and a raised Skill
    // changes what its owner rolls — the refresh costs one query and a missed
    // one has bitten this project before.
    await emitTokensOfCharacter(deps, campaignId, saved);
  }
  return updated;
}

async function lastMergeableAdjust(
  deps: RealtimeDeps,
  characterId: string,
  actorId: string,
): Promise<{ id: number; amount: number; balance: number } | null> {
  const row = await deps.ctx.prisma.advancementEntry.findFirst({
    where: { characterId },
    orderBy: { id: 'desc' },
    select: { id: true, kind: true, amount: true, balance: true, actorId: true, createdAt: true },
  });
  if (!row || row.kind !== 'adjust' || row.actorId !== actorId) return null;
  if (Date.now() - row.createdAt.getTime() > ADJUST_MERGE_MS) return null;
  return { id: row.id, amount: row.amount, balance: row.balance };
}

/** The character, refused unless the caller may spend from its pool. */
async function requireSheet(
  deps: RealtimeDeps,
  campaignId: string,
  user: { id: string; role: string },
  characterId: unknown,
): Promise<Character> {
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: typeof characterId === 'string' ? characterId : '' },
  });
  if (!character || character.campaignId !== campaignId) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  // Non-owners must not learn the character exists (stage 08).
  if (user.role !== ROLE_GM && character.ownerId !== user.id) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  return character;
}

/** The new sheet fields one bought step writes — level, or rank, never both. */
function sheetPatchFor(
  step: CpredAdvanceStep,
  data: CpredCharacterData,
): Partial<CpredCharacterData> {
  if (step.kind === 'ability') {
    // Stage 29b: a sheet may carry several Roles, and the rank of a former one
    // lives on its own row. Which of the two boxes moves is decided here rather
    // than by the request — the planner has already said which Role this is.
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

export const characterAdvanceEvent = defineEvent<CharacterAdvancePayload, CharacterView>({
  name: 'character:advance',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const character = await requireSheet(deps, campaign.id, user, payload?.characterId);
    const data = parseCharacterData(character.data, deps.ctx.cpred);

    // The same function the panel greys its buttons with, so a lit button and a
    // refused event can never disagree about what a level costs.
    const result = planCpredAdvance(data, deps.ctx.cpred, {
      kind: payload?.kind,
      skillId: payload?.skillId,
      roleId: payload?.roleId,
      to: payload?.to as number,
    });
    if (!result.ok) throw new RealtimeError(result.problem);
    const { plan } = result;

    // One save: the level and its price, or neither. A raised Skill with the
    // points still in the box is the bug this stage exists to make impossible.
    const updated = await applyImprovementPoints(
      deps,
      campaign.id,
      character,
      data,
      { kind: 'spend', amount: -plan.cost, label: describeCpredAdvance(plan) },
      user.id,
      { sheet: sheetPatchFor(plan, data), emit: false },
    );

    const saved = await deps.ctx.prisma.character.findUniqueOrThrow({
      where: { id: character.id },
    });
    const view = toCharacterView(saved, deps.ctx.cpred);
    await emitCharacterUpsert(deps, campaign.id, view);
    await emitTokensOfCharacter(deps, campaign.id, saved);
    // Interfejs is the one Special Ability with machinery older than stage 30
    // (`netrun.ts`): a rank bought mid-run has to reach the run window, or the
    // netrunner sees a budget one save out of date.
    if (
      plan.kind === 'ability' &&
      updated.cyberdeck !== null &&
      (await deps.ctx.prisma.netRun.count({ where: { characterId: character.id } })) > 0
    ) {
      await emitRuns(deps, campaign.id);
    }
    return view;
  },
});

/**
 * `character:role-change` (stage 29b, s. 143) — the sheet takes up another Role.
 *
 * Its own event for the reason `character:advance` is one: the change is gated
 * on a rank and, when the Role is new, costs 60 PD. Both are prices, and a
 * price reachable through `character:update` is not a price. The sheet fields
 * and the ledger row go down in one write, exactly as a bought level does.
 */
export const characterRoleChangeEvent = defineEvent<CharacterRoleChangePayload, CharacterView>({
  name: 'character:role-change',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const character = await requireSheet(deps, campaign.id, user, payload?.characterId);
    const data = parseCharacterData(character.data, deps.ctx.cpred);

    // The same function the panel greys its button with.
    const result = planCpredRoleChange(data, deps.ctx.cpred, payload?.roleId);
    if (!result.ok) throw new RealtimeError(result.problem);
    const { plan } = result;

    const updated = await applyImprovementPoints(
      deps,
      campaign.id,
      character,
      data,
      { kind: 'role', amount: -plan.cost, label: describeCpredRoleChange(plan) },
      user.id,
      { sheet: cpredRoleChangeSheet(data, plan), emit: false },
    );

    const saved = await deps.ctx.prisma.character.findUniqueOrThrow({
      where: { id: character.id },
    });
    const view = toCharacterView(saved, deps.ctx.cpred);
    await emitCharacterUpsert(deps, campaign.id, view);
    await emitTokensOfCharacter(deps, campaign.id, saved);
    // Interfejs is the one Special Ability with machinery older than stage 30,
    // and a change of Role moves it in both directions: a Netrunner taking up
    // another Role keeps the deck, and somebody becoming a Netrunner mid-run
    // is not a case, but a rank read one save late is.
    if (
      updated.cyberdeck !== null &&
      (await deps.ctx.prisma.netRun.count({ where: { characterId: character.id } })) > 0
    ) {
      await emitRuns(deps, campaign.id);
    }
    return view;
  },
});

export const characterXpAwardEvent = defineEvent<CharacterXpAwardPayload, CharacterXpAwardResult>({
  name: 'character:xp-award',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const amount = payload?.amount;
    if (
      typeof amount !== 'number' ||
      !Number.isInteger(amount) ||
      amount === 0 ||
      Math.abs(amount) > ADVANCEMENT_AWARD_MAX
    ) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const label =
      (typeof payload?.label === 'string' ? payload.label.trim() : '').slice(
        0,
        ADVANCEMENT_LABEL_MAX,
      ) || ADVANCEMENT_AWARD_LABEL;

    // „Po każdej sesji gry MG przyznaje wszystkim graczom" — the whole table at
    // once is the ordinary case, so it is one round trip rather than five.
    const characters = payload?.everyone
      ? await deps.ctx.prisma.character.findMany({
          where: { campaignId: campaign.id, ownerId: { not: null } },
          orderBy: { name: 'asc' },
        })
      : [await requireSheet(deps, campaign.id, user, payload?.characterId)];

    for (const character of characters) {
      const data = parseCharacterData(character.data, deps.ctx.cpred);
      await applyImprovementPoints(
        deps,
        campaign.id,
        character,
        data,
        { kind: 'award', amount, label },
        user.id,
      );
    }
    return { awarded: characters.length };
  },
});

export const characterXpHistoryEvent = defineEvent<
  CharacterXpHistoryPayload,
  CharacterXpHistoryResult
>({
  name: 'character:xp-history',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const character = await requireSheet(deps, campaign.id, user, payload?.characterId);
    const rows = await deps.ctx.prisma.advancementEntry.findMany({
      where: { characterId: character.id },
      orderBy: { id: 'desc' },
      take: ADVANCEMENT_PAGE_SIZE,
    });
    return {
      entries: rows.map((row) => ({
        id: row.id,
        // A row written by a future stage under a kind this build does not know
        // still belongs in the list; it just reads as a correction.
        kind: isAdvancementKind(row.kind) ? row.kind : 'adjust',
        amount: row.amount,
        balance: row.balance,
        label: row.label,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  },
});
