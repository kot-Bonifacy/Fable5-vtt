import type {
  ChatMessageView,
  CharacterView,
  CpredCreationDraft,
  CpredCreationRole,
  CpredStatId,
  CreationDraftView,
  CreationFinishPayload,
  CreationPatchPayload,
  RollBreakdownEntry,
  RollResult,
} from '@vtt/shared';
import {
  CPRED_CREATION_METHOD_LABELS,
  CPRED_STAT_IDS,
  CPRED_STAT_LABELS,
  ROLE_GM,
  applyRolledSpread,
  createDefaultCreationDraft,
  creationDataOf,
  creationIssues,
  creationRole,
  creationToCharacterData,
  mergeCreationDraft,
  parseCreationDraft,
  rollFormula,
  sanitizeCharacterName,
} from '@vtt/shared';
import type { CharacterDraft } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { createMixedRng } from './dice-rng.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';

/**
 * The character creator (stage 25a).
 *
 * The wizard is a client, not an authority: it shows the tables and collects
 * clicks, and everything that decides a number happens here. Two rules carry
 * the stage:
 *
 *  - **A Krawędziarz's stats come off the server's dice.** `creation:roll`
 *    throws one 1d10 per stat, reads the value out of the Role's template and
 *    writes it into the draft; a `creation:patch` carrying stats is refused for
 *    that method. The throw leaves a card on the chat, because session zero is
 *    exactly the moment when „I rolled it, honest" is worth nothing.
 *  - **The draft never becomes a half-character.** It lives in its own table
 *    until `creation:finish`, which re-runs the full validation server-side and
 *    only then writes a `Character`.
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

function toDraftView(
  row: CharacterDraft,
  deps: RealtimeDeps,
): CreationDraftView<CpredCreationDraft> {
  const data = creationDataOf(deps.ctx.cpred);
  let stored: unknown;
  try {
    stored = JSON.parse(row.data);
  } catch {
    stored = null;
  }
  return {
    draft: parseCreationDraft(stored, data, deps.ctx.cpred),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadDraft(
  deps: RealtimeDeps,
  campaignId: string,
  userId: string,
): Promise<CharacterDraft | null> {
  return deps.ctx.prisma.characterDraft.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
  });
}

async function saveDraft(
  deps: RealtimeDeps,
  campaignId: string,
  userId: string,
  draft: CpredCreationDraft,
): Promise<CharacterDraft> {
  const data = JSON.stringify(draft);
  return deps.ctx.prisma.characterDraft.upsert({
    where: { campaignId_userId: { campaignId, userId } },
    update: { data },
    create: { campaignId, userId, data },
  });
}

/**
 * Opens the wizard: hands back the draft that was already there, or starts a
 * fresh one. Idempotent on purpose — „Nowa postać" pressed twice must not
 * throw away half an hour of session zero.
 */
export const creationStartEvent = defineEvent<undefined, CreationDraftView<CpredCreationDraft>>({
  name: 'creation:start',
  handler: async ({ deps, socket, user }) => {
    const campaignId = requireCampaignId(socket.data);
    const data = creationDataOf(deps.ctx.cpred);
    if (data.roles.length === 0) throw new RealtimeError('CREATION_DATA_MISSING');

    const existing = await loadDraft(deps, campaignId, user.id);
    if (existing) return toDraftView(existing, deps);
    const row = await saveDraft(deps, campaignId, user.id, createDefaultCreationDraft(data));
    return toDraftView(row, deps);
  },
});

export const creationPatchEvent = defineEvent<
  CreationPatchPayload,
  CreationDraftView<CpredCreationDraft>
>({
  name: 'creation:patch',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const patch = payload?.patch;
    if (typeof patch !== 'object' || patch === null) throw new RealtimeError('BAD_REQUEST');

    const data = creationDataOf(deps.ctx.cpred);
    const existing = await loadDraft(deps, campaignId, user.id);
    if (!existing) throw new RealtimeError('DRAFT_NOT_FOUND');

    const current = toDraftView(existing, deps).draft;
    const next = mergeCreationDraft(current, patch, data, deps.ctx.cpred);
    if (next === null) throw new RealtimeError('INVALID_DATA');
    return toDraftView(await saveDraft(deps, campaignId, user.id, next), deps);
  },
});

/**
 * Rolls the whole spread: one 1d10 per stat, each read out of the Role's
 * template column (s. 77). One card rather than ten — the breakdown names
 * every stat and the total is the spread's point value, which is the number a
 * table actually compares (62 is what Kompletny Pakiet gets to spend).
 */
export const creationRollEvent = defineEvent<undefined, CreationDraftView<CpredCreationDraft>>({
  name: 'creation:roll',
  handler: async ({ deps, socket, user }) => {
    const campaignId = requireCampaignId(socket.data);
    const data = creationDataOf(deps.ctx.cpred);
    const existing = await loadDraft(deps, campaignId, user.id);
    if (!existing) throw new RealtimeError('DRAFT_NOT_FOUND');

    const current = toDraftView(existing, deps).draft;
    if (current.method !== 'edgerunner') throw new RealtimeError('METHOD_DOES_NOT_ROLL');
    const role = creationRole(data, current.roleId);
    if (role === null) throw new RealtimeError('ROLE_NOT_CHOSEN');
    if (role.statTemplates.length === 0) throw new RealtimeError('ROLE_HAS_NO_TEMPLATE');

    // Ten real d10 through the same engine every other roll goes through — the
    // card is not decoration, it is the audit trail of session zero. The dice
    // land in `CPRED_STAT_IDS` order, which is the order the templates print.
    const result: RollResult = rollFormula(
      { terms: [{ kind: 'dice', count: CPRED_STAT_IDS.length, sides: 10, sign: 1 }] },
      createMixedRng(),
      { checkRule: false },
    );
    const term = result.terms[0];
    const faces = term && term.kind === 'dice' ? term.rolls : [];
    const rolls: Partial<Record<CpredStatId, number>> = {};
    CPRED_STAT_IDS.forEach((id, index) => {
      const face = faces[index];
      if (face !== undefined) rolls[id] = face;
    });

    const next = applyRolledSpread(current, role, data, rolls);
    const saved = await saveDraft(deps, campaignId, user.id, next);
    await publishSpread(deps, campaignId, user.id, deps.ctx.cpred, role, next, rolls, result);
    return toDraftView(saved, deps);
  },
});

async function publishSpread(
  deps: RealtimeDeps,
  campaignId: string,
  userId: string,
  registry: RealtimeDeps['ctx']['cpred'],
  role: CpredCreationRole,
  draft: CpredCreationDraft,
  rolls: Partial<Record<CpredStatId, number>>,
  result: RollResult,
): Promise<void> {
  const breakdown: RollBreakdownEntry[] = [];
  let total = 0;
  for (const id of CPRED_STAT_IDS) {
    const value = draft.stats[id];
    const roll = rolls[id];
    if (value === undefined || roll === undefined) continue;
    total += value;
    breakdown.push({
      label: `${CPRED_STAT_LABELS[id].abbr} · rzut ${roll}`,
      value,
      kind: 'stat',
    });
  }
  // The dice sum means nothing here (the faces are row numbers), so the card
  // shows what the spread is worth instead.
  result.total = total;
  result.notation = `${CPRED_STAT_IDS.length}k10`;
  result.breakdown = breakdown;
  const roleName = registry.roles.find((entry) => entry.id === role.id)?.name ?? role.id;
  result.title = `Rozkład Cech — ${roleName} · ${CPRED_CREATION_METHOD_LABELS.edgerunner}`;
  if (draft.name.trim().length > 0) result.actor = draft.name.trim();

  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: userId,
      kind: 'roll',
      text: result.title,
      payload: JSON.stringify(result),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  const view: ChatMessageView = toChatMessageView(stored);
  await deliverRollMessage(deps, campaignId, userId, view);
}

/**
 * Turns the draft into a real sheet. The validation runs here again, on the
 * server's copy of the tables — the wizard's greyed-out button is a courtesy,
 * not a gate.
 */
export const creationFinishEvent = defineEvent<CreationFinishPayload, CharacterView>({
  name: 'creation:finish',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const data = creationDataOf(deps.ctx.cpred);
    const existing = await loadDraft(deps, campaignId, user.id);
    if (!existing) throw new RealtimeError('DRAFT_NOT_FOUND');

    const draft = toDraftView(existing, deps).draft;
    if (creationIssues(draft, data, deps.ctx.cpred).length > 0) {
      throw new RealtimeError('CREATION_INCOMPLETE');
    }
    const name = sanitizeCharacterName(draft.name);
    if (name === null) throw new RealtimeError('INVALID_NAME');

    // Same ownership rule as `character:create`: players own what they build.
    let ownerId: string | null = user.id;
    if (user.role === ROLE_GM) {
      ownerId = payload?.ownerId ?? null;
      if (ownerId !== null) {
        const membership = await deps.ctx.prisma.campaignMember.findUnique({
          where: { campaignId_userId: { campaignId, userId: ownerId } },
        });
        if (!membership) throw new RealtimeError('OWNER_NOT_FOUND');
      }
    }

    const character = await deps.ctx.prisma.character.create({
      data: {
        campaignId,
        name,
        ownerId,
        data: JSON.stringify(creationToCharacterData(draft, data)),
      },
    });
    await deps.ctx.prisma.characterDraft.delete({ where: { id: existing.id } });

    const view = toCharacterView(character, deps.ctx.cpred);
    await emitCharacterUpsert(deps, campaignId, view);
    return view;
  },
});

/** Throws the draft away. The wizard asks twice before it gets here. */
export const creationDiscardEvent = defineEvent<undefined, void>({
  name: 'creation:discard',
  handler: async ({ deps, socket, user }) => {
    const campaignId = requireCampaignId(socket.data);
    await deps.ctx.prisma.characterDraft.deleteMany({ where: { campaignId, userId: user.id } });
  },
});
