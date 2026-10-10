import type {
  ChatMessageView,
  CompendiumEntry,
  CpredCharacterData,
  CpredCreationDraft,
  CpredCreationRole,
  CpredLifepath,
  CpredLifepathTable,
  CpredStatId,
  CreationBuyPayload,
  CreationDraftPeek,
  CreationDraftView,
  CreationFinishPayload,
  CreationFinishResult,
  CreationRankDraft,
  CreationLifepathCountPayload,
  CreationLifepathRollPayload,
  CreationPatchPayload,
  CreationPermitPayload,
  CreationPermitRow,
  CreationPermitState,
  CreationRandomNpcPayload,
  CreationRandomNpcResult,
  CreationTerms,
  CreationTermsPayload,
  CreationRerolledPush,
  CreationRerollPayload,
  CreationRollPayload,
  PurchasedRow,
  RollBreakdownEntry,
  RollGesture,
  RollResult,
} from '@vtt/shared';
import {
  CPRED_CREATION_METHOD_LABELS,
  CPRED_STAT_IDS,
  CPRED_STAT_LABELS,
  CPRED_TEMPLATE_ROLLS,
  CREATION_PURCHASE_QTY_MAX,
  LIFEPATH_GROUP_LABELS,
  LIFEPATH_ROLL_TABLES_MAX,
  ROLE_GM,
  applyLifepathEntry,
  applyRolledSpread,
  clearRolledStats,
  cpredRandomNpc,
  createDefaultCreationDraft,
  cpredPurchasedAmmoRow,
  cpredFitDeckFromGear,
  cpredPutAmmo,
  creationBasketEntry,
  creationBasketKey,
  creationBudget,
  creationDataOf,
  creationIssues,
  creationLifestyle,
  creationKitSheetRows,
  creationPurchases,
  creationRoleKit,
  creationRoleKitOf,
  creationRole,
  creationSkillPool,
  creationSpentEddies,
  creationToCharacterData,
  entryPrice,
  isCpredStatId,
  isCreationSkillPool,
  isLifepathGroup,
  lifepathDataOf,
  lifepathEntryFor,
  lifepathGroupCount,
  lifepathTable,
  mergeCharacterData,
  mergeCreationDraft,
  parseCreationDraft,
  purchasedSheetRow,
  resizeLifepathGroup,
  resolveWeapon,
  rollFormula,
  sanitizeCharacterName,
  toAmmoProfile,
  ITEM_ROWS_MAX,
  creationShopVerdict,
  type CreationShopRules,
} from '@vtt/shared';
import type { Character, CharacterDraft, Prisma, Scene } from '../generated/prisma/client.js';
import { usedPortraitUrls } from '../portraits.js';
import { RealtimeError, defineEvent, type RealtimeDeps, type RealtimeEvent } from './registry.js';
import { requireOwnUploadUrl } from '../campaign-uploads.js';
import { createMixedRng } from './dice-rng.js';
import { sanitizeGesture } from './chat.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { campaignEntry } from './compendium.js';
import { applyBalance, nextRowId } from './economy.js';
import { getActiveScene } from './scenes.js';
import { campaignShopTierOverrides } from './shop.js';
import { gmRoom } from './state.js';
import { createCharacterToken } from './tokens.js';

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

// Includes every creator operation and every socket of a campaign, including
// the GM changing another user's rank. The app runs as one server process.
const creationQueues = new WeakMap<object, Map<string, Promise<unknown>>>();
function defineCreationEvent<P = unknown, R = void>(
  event: RealtimeEvent<P, R>,
): RealtimeEvent<P, R> {
  return defineEvent({
    ...event,
    handler: (args) => {
      const campaignId = requireCampaignId(args.socket.data);
      let queues = creationQueues.get(args.deps.ctx.prisma);
      if (!queues) {
        queues = new Map();
        creationQueues.set(args.deps.ctx.prisma, queues);
      }
      const next = (queues.get(campaignId) ?? Promise.resolve())
        .catch(() => undefined)
        .then(() => event.handler(args));
      queues.set(campaignId, next);
      void next
        .finally(() => {
          if (queues.get(campaignId) === next) queues.delete(campaignId);
        })
        .catch(() => undefined);
      return next;
    },
  });
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
  const draft = parseCreationDraft(stored, data, deps.ctx.cpred);
  const rankApproved = data.statRanks.some((rank) => rank.id === row.statRankId);
  draft.statRankId = rankApproved ? row.statRankId! : createDefaultCreationDraft(data).statRankId;
  return {
    id: row.id,
    revision: row.revision,
    rankApproved,
    draft,
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
    update: { data, revision: { increment: 1 } },
    create: { campaignId, userId, data },
  });
}

/* ───────────── zgoda MG na nową postać (decyzja MG z 24.09) ───────────── */

/**
 * The GM's consent, as the player sees it. A player asks, the GM agrees, the
 * player reads the rules („each stat once, no discarding, the GM approves the
 * result") and only then can a draft exist. The GM needs none of it.
 *
 * A draft that already exists never asks — it was started before the rule, or
 * under a consent that is already in use — so nobody loses session zero to
 * the migration.
 */
async function permitStateOf(
  deps: RealtimeDeps,
  campaignId: string,
  user: { id: string; role: string },
): Promise<CreationPermitState> {
  if (user.role === ROLE_GM) return { status: 'granted', rulesAccepted: true };
  const member = await deps.ctx.prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId: user.id } },
  });
  const status = member?.creationPermit;
  const terms = status === 'granted' ? readTerms(member?.creationTerms, deps) : null;
  return {
    status: status === 'requested' || status === 'granted' ? status : 'none',
    rulesAccepted: status === 'granted' && member?.creationRulesAcceptedAt != null,
    ...(terms ? { terms } : {}),
  };
}

/**
 * The GM's terms from a payload or the stored column (24.09): a method, a
 * rank that exists in the data files, and a skill budget in range. Anything
 * else is not a term the wizard can honour.
 */
function readTerms(raw: unknown, deps: RealtimeDeps): CreationTerms | null {
  let input: unknown = raw;
  if (typeof raw === 'string') {
    try {
      input = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof input !== 'object' || input === null) return null;
  const terms = input as Record<string, unknown>;
  const data = creationDataOf(deps.ctx.cpred);
  if (terms.method !== 'edgerunner' && terms.method !== 'complete') return null;
  if (
    typeof terms.statRankId !== 'string' ||
    !data.statRanks.some((rank) => rank.id === terms.statRankId)
  )
    return null;
  if (!isCreationSkillPool(terms.skillPoints)) return null;
  return { method: terms.method, statRankId: terms.statRankId, skillPoints: terms.skillPoints };
}

/** Tells every window of one player where their consent stands now. */
async function pushPermitState(
  deps: RealtimeDeps,
  campaignId: string,
  userId: string,
  extra: Partial<CreationPermitState> = {},
): Promise<void> {
  const state = { ...(await permitStateOf(deps, campaignId, { id: userId, role: '' })), ...extra };
  for (const peer of await deps.io.fetchSockets()) {
    if (peer.data.user?.id === userId && peer.data.campaign?.id === campaignId) {
      peer.emit('creation:permit-state', state);
    }
  }
}

async function setPermit(
  deps: RealtimeDeps,
  campaignId: string,
  userId: string,
  permit: 'requested' | 'granted' | null,
): Promise<void> {
  await deps.ctx.prisma.campaignMember.updateMany({
    where: { campaignId, userId },
    data: { creationPermit: permit, creationRulesAcceptedAt: null, creationTerms: null },
  });
}

export const creationPermitStateEvent = defineCreationEvent<undefined, CreationPermitState>({
  name: 'creation:permit-state',
  handler: async ({ deps, socket, user }) =>
    permitStateOf(deps, requireCampaignId(socket.data), user),
});

/** „Poproś MG o stworzenie postaci" — and, with `cancel`, taking it back. */
export const creationRequestEvent = defineCreationEvent<
  { cancel?: boolean } | undefined,
  CreationPermitState
>({
  name: 'creation:request',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (user.role === ROLE_GM) throw new RealtimeError('FORBIDDEN');
    const current = await permitStateOf(deps, campaignId, user);
    if (payload?.cancel) {
      if (current.status === 'requested') await setPermit(deps, campaignId, user.id, null);
    } else if (current.status === 'none') {
      if (await loadDraft(deps, campaignId, user.id)) throw new RealtimeError('DRAFT_EXISTS');
      await setPermit(deps, campaignId, user.id, 'requested');
    }
    await broadcastCreationRanks(deps, campaignId);
    return permitStateOf(deps, campaignId, user);
  },
});

/**
 * The GM's answer. `grant: true` agrees to a request; `grant: false` refuses
 * it, or takes back a consent the player has not used yet. A consent in use —
 * a draft exists — is ended only by discarding that draft.
 */
export const creationPermitEvent = defineCreationEvent<CreationPermitPayload, void>({
  name: 'creation:permit',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (!payload || typeof payload.userId !== 'string' || typeof payload.grant !== 'boolean')
      throw new RealtimeError('BAD_REQUEST');
    const member = await deps.ctx.prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId, userId: payload.userId } },
    });
    if (!member) throw new RealtimeError('OWNER_NOT_FOUND');
    if (await loadDraft(deps, campaignId, payload.userId)) throw new RealtimeError('DRAFT_EXISTS');
    if (payload.grant) {
      // Decyzja MG z 24.09: the consent carries the method, the rank and the
      // skill budget. Agreeing again to an unused consent rewrites them and
      // keeps the rules the player may already have read.
      const terms = readTerms(payload.terms, deps);
      if (!terms) throw new RealtimeError('BAD_TERMS');
      if (member.creationPermit !== 'requested' && member.creationPermit !== 'granted')
        throw new RealtimeError('NO_REQUEST');
      await deps.ctx.prisma.campaignMember.update({
        where: { id: member.id },
        data: {
          creationPermit: 'granted',
          creationTerms: JSON.stringify(terms),
          ...(member.creationPermit === 'requested' ? { creationRulesAcceptedAt: null } : {}),
        },
      });
      await pushPermitState(deps, campaignId, payload.userId);
    } else {
      if (member.creationPermit === null) throw new RealtimeError('NO_REQUEST');
      await setPermit(deps, campaignId, payload.userId, null);
      await pushPermitState(deps, campaignId, payload.userId, { refused: true });
    }
    await broadcastCreationRanks(deps, campaignId);
  },
});

/** „Rozumiem, zaczynam" under the creation rules — the last step before a draft. */
export const creationAcceptRulesEvent = defineCreationEvent<undefined, CreationPermitState>({
  name: 'creation:accept-rules',
  handler: async ({ deps, socket, user }) => {
    const campaignId = requireCampaignId(socket.data);
    const current = await permitStateOf(deps, campaignId, user);
    if (current.status !== 'granted') throw new RealtimeError('CREATION_NOT_PERMITTED');
    if (user.role !== ROLE_GM) {
      await deps.ctx.prisma.campaignMember.updateMany({
        where: { campaignId, userId: user.id },
        data: { creationRulesAcceptedAt: new Date() },
      });
      await broadcastCreationRanks(deps, campaignId);
    }
    return permitStateOf(deps, campaignId, user);
  },
});

/**
 * The GM throws away a player's draft — the only way a player's creation can
 * start over (decyzja MG z 24.09). The consent goes with it, so a new attempt
 * begins with a new request.
 */
export const creationDiscardPlayerEvent = defineCreationEvent<{ draftId: string }, void>({
  name: 'creation:discard-player',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (!payload || typeof payload.draftId !== 'string' || !payload.draftId)
      throw new RealtimeError('BAD_REQUEST');
    const row = await deps.ctx.prisma.characterDraft.findFirst({
      where: { id: payload.draftId, campaignId },
    });
    if (!row) throw new RealtimeError('DRAFT_NOT_FOUND');
    await deps.ctx.prisma.characterDraft.delete({ where: { id: row.id } });
    await setPermit(deps, campaignId, row.userId, null);
    for (const peer of await deps.io.fetchSockets()) {
      if (peer.data.user?.id === row.userId && peer.data.campaign?.id === campaignId) {
        peer.emit('creation:discarded', { draftId: row.id });
      }
    }
    await pushPermitState(deps, campaignId, row.userId);
    await broadcastCreationRanks(deps, campaignId);
  },
});

/**
 * Opens the wizard: hands back the draft that was already there, or starts a
 * fresh one. Idempotent on purpose — „Nowa postać" pressed twice must not
 * throw away half an hour of session zero. A player's fresh draft needs the
 * GM's consent and the accepted rules first (24.09).
 */
export const creationStartEvent = defineCreationEvent<
  undefined,
  CreationDraftView<CpredCreationDraft>
>({
  name: 'creation:start',
  handler: async ({ deps, socket, user }) => {
    const campaignId = requireCampaignId(socket.data);
    const data = creationDataOf(deps.ctx.cpred);
    if (data.roles.length === 0) throw new RealtimeError('CREATION_DATA_MISSING');

    const existing = await loadDraft(deps, campaignId, user.id);
    if (existing) return toDraftView(existing, deps);
    const permit = await permitStateOf(deps, campaignId, user);
    if (permit.status !== 'granted') throw new RealtimeError('CREATION_NOT_PERMITTED');
    if (!permit.rulesAccepted) throw new RealtimeError('CREATION_RULES_PENDING');
    // The GM's terms (24.09) shape the fresh draft: his method, fixed; his
    // rank, already approved; his skill budget. A consent without terms (only
    // ever written by hand) opens the draft the way it opened before.
    const terms = user.role === ROLE_GM ? null : (permit.terms ?? null);
    const fresh = createDefaultCreationDraft(data);
    const row = await saveDraft(
      deps,
      campaignId,
      user.id,
      terms ? { ...fresh, ...draftTermsPatch(terms, data) } : fresh,
    );
    if (terms) {
      await deps.ctx.prisma.characterDraft.update({
        where: { id: row.id },
        data: { statRankId: terms.statRankId },
      });
      row.statRankId = terms.statRankId;
    }
    if (user.role !== ROLE_GM) await broadcastCreationRanks(deps, campaignId);
    return toDraftView(row, deps);
  },
});

export const creationPatchEvent = defineCreationEvent<
  CreationPatchPayload,
  CreationDraftView<CpredCreationDraft>
>({
  name: 'creation:patch',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const patch = payload?.patch;
    if (typeof patch !== 'object' || patch === null) throw new RealtimeError('BAD_REQUEST');
    if (
      (payload.draftId !== undefined &&
        (typeof payload.draftId !== 'string' || !payload.draftId)) ||
      (payload.requestId !== undefined &&
        (typeof payload.requestId !== 'string' ||
          !payload.requestId ||
          payload.requestId.length > 128)) ||
      (payload.revision !== undefined &&
        (!Number.isSafeInteger(payload.revision) || payload.revision < 0))
    )
      throw new RealtimeError('BAD_REQUEST');

    const data = creationDataOf(deps.ctx.cpred);
    const existing = await loadDraft(deps, campaignId, user.id);
    if (!existing) throw new RealtimeError('DRAFT_NOT_FOUND');

    if (payload.draftId && payload.draftId !== existing.id)
      throw new RealtimeError('DRAFT_NOT_FOUND');
    if (payload.requestId && payload.requestId === existing.lastPatchId)
      return toDraftView(existing, deps);
    if (payload.revision !== undefined && payload.revision !== existing.revision)
      throw new RealtimeError('DRAFT_CHANGED');
    const view = toDraftView(existing, deps);
    const current = view.draft;
    if ('statRankId' in patch && user.role !== ROLE_GM) throw new RealtimeError('FORBIDDEN');
    // A Role change takes the previous Role's tools off the basket (naprawa 3b),
    // which needs the catalogue rows and the campaign's shelf rules.
    const shop =
      'roleId' in patch
        ? {
            lookup: await purchaseLookup(deps, campaignId, Object.keys(current.purchases)),
            rules: await creationShopRules(deps, campaignId),
          }
        : undefined;
    const next = mergeCreationDraft(current, patch, data, deps.ctx.cpred, shop);
    if (next === null) throw new RealtimeError('INVALID_DATA');
    // The pool is the GM's call (naprawa 2a): a player who bought stats out of
    // the default 62 would have to redo them when the GM picks 50. Stats a
    // draft already holds stay put; only new writes wait for the rank.
    if (
      'stats' in patch &&
      next.method === 'complete' &&
      user.role !== ROLE_GM &&
      !view.rankApproved
    )
      throw new RealtimeError('CREATION_RANK_PENDING');
    // Rezerwacja i sprawdzenie w jednej transakcji: równoczesny wybór nie
    // może przydzielić tej samej twarzy dwóm szkicom.
    if ('portraitUrl' in patch) requireOwnUploadUrl(next.portraitUrl, campaignId);
    const saved = await deps.ctx.prisma.$transaction(async (tx) => {
      if ('portraitUrl' in patch && next.portraitUrl && user.role !== ROLE_GM) {
        const asset = await tx.portraitAsset.findFirst({
          where: {
            campaignId,
            url: next.portraitUrl,
            // Portret NPC (23.09) gracz może nosić tylko z nadania MG, nie z wyboru.
            ...(next.portraitUrl === current.portraitUrl ? {} : { retired: false, gmOnly: false }),
          },
        });
        if (!asset) throw new RealtimeError('PORTRAIT_NOT_AVAILABLE');
        if ((await usedPortraitUrls(tx, campaignId, user.id)).has(next.portraitUrl)) {
          throw new RealtimeError('PORTRAIT_TAKEN');
        }
      }
      return tx.characterDraft.update({
        where: { id: existing.id },
        data: {
          data: JSON.stringify(next),
          revision: { increment: 1 },
          lastPatchId: payload.requestId ?? null,
          ...('statRankId' in patch ? { statRankId: next.statRankId } : {}),
        },
      });
    });
    if (
      user.role !== ROLE_GM &&
      (next.method !== current.method || next.name.trim() !== current.name.trim())
    )
      await broadcastCreationRanks(deps, campaignId);
    return toDraftView(saved, deps);
  },
});

/**
 * Rolls one stat — or, for the GM's plain button, every stat still missing —
 * off the Role's template column (s. 77).
 *
 * One stat per throw is the GM's order (17.09): „gracze powinni rzucać małą
 * ilością kości na raz", through the cup, a card per die. A player rolls each
 * stat **once** (decyzja MG z 24.09); a face already in the draft refuses the
 * throw with `STAT_ALREADY_ROLLED` until the GM's `creation:reroll` takes it
 * off. The GM's own drafts may throw a stat again — that is the NPC workbench.
 */
export const creationRollEvent = defineCreationEvent<
  CreationRollPayload,
  CreationDraftView<CpredCreationDraft>
>({
  name: 'creation:roll',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const data = creationDataOf(deps.ctx.cpred);
    const isGm = user.role === ROLE_GM;
    const statId = payload?.statId;
    if (statId !== undefined && !isCpredStatId(statId)) throw new RealtimeError('BAD_REQUEST');
    if (statId === undefined && !isGm) throw new RealtimeError('FORBIDDEN');
    const existing = await loadDraft(deps, campaignId, user.id);
    if (!existing) throw new RealtimeError('DRAFT_NOT_FOUND');

    const current = toDraftView(existing, deps).draft;
    if (current.method !== 'edgerunner') throw new RealtimeError('METHOD_DOES_NOT_ROLL');
    const role = creationRole(data, current.roleId);
    if (role === null) throw new RealtimeError('ROLE_NOT_CHOSEN');
    if (role.statTemplates.length === 0) throw new RealtimeError('ROLE_HAS_NO_TEMPLATE');

    const ids: CpredStatId[] =
      statId === undefined
        ? CPRED_STAT_IDS.filter((id) => current.statRolls[id] === undefined)
        : [statId];
    if (ids.length === 0) throw new RealtimeError('STATS_ALREADY_ROLLED');
    if (statId !== undefined && !isGm && current.statRolls[statId] !== undefined)
      throw new RealtimeError('STAT_ALREADY_ROLLED');

    // Real d10 through the same engine every other roll goes through — the
    // card is not decoration, it is the audit trail of session zero.
    //
    // The cup's shake is mixed into the seed exactly as it is for a sheet
    // check: the hand picks the face, and the server still decides what
    // „equally likely" means. The GM's plain button rolls without a gesture.
    //
    // `plain` (stage 27d) is what stops the card from painting the tens green
    // and the ones red: these dice are template rows, not Checks, and a 10
    // here means „the tenth row", not a critical.
    const gesture: RollGesture | undefined = sanitizeGesture(payload?.gesture);
    const result: RollResult = rollFormula(
      { terms: [{ kind: 'dice', count: ids.length, sides: 10, sign: 1 }] },
      createMixedRng(gesture?.entropy),
      { checkRule: false, plain: true },
    );
    if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
    if (gesture?.toss) result.toss = gesture.toss;
    const term = result.terms[0];
    const faces = term && term.kind === 'dice' ? term.rolls : [];
    const rolls: Partial<Record<CpredStatId, number>> = {};
    ids.forEach((id, index) => {
      const face = faces[index];
      if (face !== undefined) rolls[id] = face;
    });

    const next = applyRolledSpread(current, role, data, rolls);
    const saved = await saveDraft(deps, campaignId, user.id, next);
    await publishSpread(deps, campaignId, user, deps.ctx.cpred, role, next, rolls, result);
    if (!isGm) await broadcastCreationRanks(deps, campaignId);
    return toDraftView(saved, deps);
  },
});

/** The draft fields that carry the GM's terms (the rank lives in its own column). */
function draftTermsPatch(
  terms: CreationTerms,
  data: ReturnType<typeof creationDataOf>,
): Pick<CpredCreationDraft, 'method' | 'methodFixed' | 'skillPool'> {
  return {
    method: terms.method,
    methodFixed: true,
    skillPool: terms.skillPoints === data.skillPoints ? null : terms.skillPoints,
  };
}

/**
 * New terms for a player's draft (decyzja MG z 24.09: the GM may change them
 * while the character is being built). A method change goes through the same
 * `mergeCreationDraft` a player's switch used to — it drops what the other
 * method cannot pay for, but never the dice — and the revision moves, so a
 * write built on the old terms is refused instead of landing on the new ones.
 * Skills already spent stay; the wizard shows the surplus or the shortfall.
 */
export const creationTermsEvent = defineCreationEvent<CreationTermsPayload, void>({
  name: 'creation:terms',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const data = creationDataOf(deps.ctx.cpred);
    const terms = readTerms(payload?.terms, deps);
    if (!payload || typeof payload.draftId !== 'string' || !payload.draftId || !terms)
      throw new RealtimeError('BAD_TERMS');
    const row = await deps.ctx.prisma.characterDraft.findFirst({
      where: { id: payload.draftId, campaignId },
    });
    if (!row) throw new RealtimeError('DRAFT_NOT_FOUND');
    const current = toDraftView(row, deps).draft;
    let next: CpredCreationDraft | null = current;
    if (terms.method !== current.method) {
      const shopRules = await creationShopRules(deps, campaignId);
      const lookup = await purchaseLookup(deps, campaignId, Object.keys(current.purchases));
      next = mergeCreationDraft(
        { ...current, methodFixed: false },
        { method: terms.method },
        data,
        deps.ctx.cpred,
        { lookup, rules: shopRules },
      );
      if (!next) throw new RealtimeError('BAD_TERMS');
    }
    next = { ...next, ...draftTermsPatch(terms, data) };
    await deps.ctx.prisma.characterDraft.update({
      where: { id: row.id },
      data: {
        data: JSON.stringify(next),
        statRankId: terms.statRankId,
        revision: { increment: 1 },
      },
    });
    for (const peer of await deps.io.fetchSockets()) {
      if (peer.data.user?.id === row.userId && peer.data.campaign?.id === campaignId) {
        peer.emit('creation:terms-changed', { draftId: row.id });
      }
    }
    await broadcastCreationRanks(deps, campaignId);
  },
});

/**
 * The GM's „Pozwól przerzucić" (decyzja MG z 24.09): takes the dice off one
 * stat, or all of them, in any draft of the campaign. The chat keeps the old
 * card — the log says what was thrown and the draft says what counts.
 *
 * No `revision` bump, for the reason `creation:set-rank` gives: stats and dice
 * are not patch fields, so a player's write in flight cannot overwrite them,
 * and a bump would only refuse that write as DRAFT_CHANGED. The owner's
 * windows hear `creation:rerolled` and drop the same stats from their copy.
 */
export const creationRerollEvent = defineCreationEvent<CreationRerollPayload, void>({
  name: 'creation:reroll',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (!payload || typeof payload.draftId !== 'string' || !payload.draftId)
      throw new RealtimeError('BAD_REQUEST');
    const statId = payload.statId;
    if (statId !== undefined && !isCpredStatId(statId)) throw new RealtimeError('BAD_REQUEST');
    const row = await deps.ctx.prisma.characterDraft.findFirst({
      where: { id: payload.draftId, campaignId },
    });
    if (!row) throw new RealtimeError('DRAFT_NOT_FOUND');
    const current = toDraftView(row, deps).draft;
    const statIds = (statId === undefined ? CPRED_STAT_IDS : [statId]).filter(
      (id) => current.statRolls[id] !== undefined,
    );
    if (statIds.length === 0) throw new RealtimeError('NOTHING_TO_REROLL');
    await deps.ctx.prisma.characterDraft.update({
      where: { id: row.id },
      data: { data: JSON.stringify(clearRolledStats(current, statIds)) },
    });
    const push: CreationRerolledPush = { draftId: row.id, statIds };
    for (const peer of await deps.io.fetchSockets()) {
      if (peer.data.user?.id === row.userId && peer.data.campaign?.id === campaignId) {
        peer.emit('creation:rerolled', push);
      }
    }
    await broadcastCreationRanks(deps, campaignId);
  },
});

async function publishSpread(
  deps: RealtimeDeps,
  campaignId: string,
  author: RollAuthor,
  registry: RealtimeDeps['ctx']['cpred'],
  role: CpredCreationRole,
  draft: CpredCreationDraft,
  rolls: Partial<Record<CpredStatId, number>>,
  result: RollResult,
): Promise<void> {
  const breakdown: RollBreakdownEntry[] = [];
  let total = 0;
  const rolled = CPRED_STAT_IDS.filter((id) => rolls[id] !== undefined);
  for (const id of rolled) {
    const value = draft.stats[id];
    const roll = rolls[id];
    if (value === undefined || roll === undefined) continue;
    total += value;
    breakdown.push({
      label: `${CPRED_STAT_LABELS[id].abbr}: rzut ${roll}`,
      value,
      kind: 'stat',
      lookup: true,
    });
  }
  // The die means nothing here (the face is a row number), so the card shows
  // what it is worth instead: the stat itself, or the missing stats' sum.
  result.total = total;
  result.notation = `${rolled.length}k10`;
  result.breakdown = breakdown;
  const roleName = registry.roles.find((entry) => entry.id === role.id)?.name ?? role.id;
  const only = rolled.length === 1 ? rolled[0] : undefined;
  result.title = only
    ? `${CPRED_STAT_LABELS[only].name} (${CPRED_STAT_LABELS[only].abbr}) — ${roleName}`
    : `Rozkład Cech — ${roleName} · ${CPRED_CREATION_METHOD_LABELS.edgerunner}`;
  if (draft.name.trim().length > 0) result.actor = draft.name.trim();
  await publishRoll(deps, campaignId, author, result);
}

/** Who threw the die — the role decides who gets to see the card. */
type RollAuthor = { id: string; role: string };

/**
 * Puts a finished roll on the chat. A player's throw lands where the whole
 * table can check it; the GM's throw is the GM's alone (`gmroll`, etap 49a,
 * decyzja MG z 10.10) — a GM rolling up an NPC must not show the players
 * the ganger's stats before the fight.
 */
async function publishRoll(
  deps: RealtimeDeps,
  campaignId: string,
  author: RollAuthor,
  result: RollResult,
): Promise<void> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: author.id,
      kind: author.role === ROLE_GM ? 'gmroll' : 'roll',
      text: result.title ?? 'Rzut',
      payload: JSON.stringify(result),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  const view: ChatMessageView = toChatMessageView(stored);
  await deliverRollMessage(deps, campaignId, author.id, view);
}

/**
 * „🎲 Losuj z Roli” w oknie „Nowa postać” (etap 49b, decyzje MG z 10.10).
 *
 * Krawędziarz automatem bez szkicu: 1k10 wybiera wiersz Cech z tabeli Roli,
 * Umiejętności to tabela Ulicznika z rozrzutem, broń i pancerz — pakiet Roli
 * (`cpredRandomNpc`). Serwer tylko rzuca i oddaje statblok; kartę zakłada
 * dopiero „Utwórz” (`character:create`), więc MG może wynik poprawić albo
 * losować dalej. Kartę rzutu widzi wyłącznie MG (`gmroll` przez `publishRoll`).
 */
export const creationRandomNpcEvent = defineEvent<
  CreationRandomNpcPayload,
  CreationRandomNpcResult
>({
  name: 'creation:random-npc',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (user.role !== ROLE_GM) throw new RealtimeError('FORBIDDEN');
    const roleId = payload?.roleId;
    if (typeof roleId !== 'string' || roleId.length === 0) throw new RealtimeError('BAD_REQUEST');
    const data = creationDataOf(deps.ctx.cpred);
    const kit = data.streetrat[roleId];
    if (!kit) throw new RealtimeError('ROLE_HAS_NO_TEMPLATE');
    const lookup = await purchaseLookup(
      deps,
      campaignId,
      kit.items.flat().filter((id): id is string => id !== null),
    );

    // Jedna kość na karcie to wiersz Cech; wybory „lub” i rozrzut biorą
    // z tego samego generatora, ale nie są rzutem, który MG ma oglądać.
    const gesture = sanitizeGesture(payload?.gesture);
    const rng = createMixedRng(gesture?.entropy);
    const result: RollResult = rollFormula(
      { terms: [{ kind: 'dice', sign: 1, count: 1, sides: CPRED_TEMPLATE_ROLLS }] },
      rng,
      { checkRule: false, plain: true },
    );
    if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
    if (gesture?.toss) result.toss = gesture.toss;
    const term = result.terms[0];
    const face = term && term.kind === 'dice' ? (term.rolls[0] ?? 1) : 1;
    let rowRolled = false;
    const npcRng = (sides: number): number => {
      if (rowRolled) return rng(sides);
      rowRolled = true;
      return face;
    };
    const multipliers = new Map(
      deps.ctx.cpred.skills.map((skill) => [skill.id, skill.multiplier ?? 1]),
    );
    const rolled = cpredRandomNpc(roleId, data, multipliers, lookup, npcRng);
    if (!rolled) throw new RealtimeError('ROLE_HAS_NO_TEMPLATE');

    const skillName = (id: string) =>
      deps.ctx.cpred.skills.find((skill) => skill.id === id)?.name ?? id;
    const breakdown: RollBreakdownEntry[] = CPRED_STAT_IDS.map((id) => ({
      label: CPRED_STAT_LABELS[id].abbr,
      value: rolled.input.stats[id],
      kind: 'stat',
      lookup: true as const,
    }));
    for (const [id, delta] of Object.entries(rolled.shifted)) {
      breakdown.push({ label: `${skillName(id)} (rozrzut)`, value: delta, kind: 'skill' });
    }
    for (const pick of rolled.picks) {
      if (pick.options.length < 2) continue;
      const names = pick.options.map((id) => (id === null ? 'granat' : (lookup(id)?.name ?? id)));
      breakdown.push({
        label: names.join(' / '),
        value: pick.options.indexOf(pick.chosen) + 1,
        kind: 'pick',
        lookup: true,
      });
    }
    const roleName = deps.ctx.cpred.roles.find((entry) => entry.id === roleId)?.name ?? roleId;
    result.title = `Losowy NPC — ${roleName} · wiersz Cech ${rolled.row}`;
    result.notation = `1k${CPRED_TEMPLATE_ROLLS}`;
    result.total = rolled.row;
    result.breakdown = breakdown;
    await publishRoll(deps, campaignId, user, result);
    return { npc: rolled.input };
  },
});

/**
 * The starting shop (stage 25c) — one item into or out of the basket.
 *
 * Everything that decides anything happens here: the price comes off the
 * catalogue, the budget off the method, and the shelf is street level plus the
 * Role's own tools up to Zawodowe (naprawa 3b) for **everybody, the GM
 * included**. That last one is deliberate and the only blocked path in the
 * project a GM does not walk through: a starting kit limited to what any kiosk
 * sells is the whole point of the restriction (the GM's wish, 14.08), and an
 * exemption would turn it into a suggestion. The GM can still hand a new
 * character a rifle afterwards — „Dodaj za darmo" on the catalogue card has
 * never asked anybody's permission — or move one entry for the campaign.
 */
export const creationBuyEvent = defineCreationEvent<
  CreationBuyPayload,
  CreationDraftView<CpredCreationDraft>
>({
  name: 'creation:buy',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const data = creationDataOf(deps.ctx.cpred);
    const existing = await loadDraft(deps, campaignId, user.id);
    if (!existing) throw new RealtimeError('DRAFT_NOT_FOUND');
    const current = toDraftView(existing, deps).draft;

    if (typeof payload?.entryId !== 'string' || payload.entryId.length === 0) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const delta = payload?.delta;
    if (delta !== 1 && delta !== -1) throw new RealtimeError('BAD_REQUEST');
    // Etap 46c: amunicja leży w koszyku pod kluczem z kalibrem. Klient podaje
    // klucz wprost (−1 przy wierszu koszyka) albo id wpisu i typ broni.
    const parsed = creationBasketEntry(payload.entryId);
    const weaponTypeId =
      parsed.weaponTypeId ??
      (typeof payload.weaponTypeId === 'string' && payload.weaponTypeId.length > 0
        ? payload.weaponTypeId
        : null);
    const key = creationBasketKey(parsed.entryId, weaponTypeId);

    const purchases = { ...current.purchases };
    const held = purchases[key] ?? 0;
    if (delta === -1) {
      if (held <= 1) delete purchases[key];
      else purchases[key] = held - 1;
    } else {
      const entry = await campaignEntry(deps, campaignId, parsed.entryId);
      if (!entry) throw new RealtimeError('ENTRY_NOT_FOUND');
      if (entryPrice(entry) === null) throw new RealtimeError('NO_PRICE');
      if (entry.category === 'ammo') {
        // Etap 46c: nabój kupuje się do kalibru, nie „w ogóle”.
        const type = weaponTypeId ? deps.ctx.compendium.weaponTypeById.get(weaponTypeId) : null;
        if (!type) throw new RealtimeError('AMMO_CALIBRE_REQUIRED');
        if (!cpredPurchasedAmmoRow(toAmmoProfile(entry), type, 1, 'probe')) {
          throw new RealtimeError('AMMO_MISMATCH');
        }
      } else if (weaponTypeId !== null) {
        throw new RealtimeError('BAD_REQUEST');
      }
      // „Tego się tu nie kupuje" comes before „nie na tym poziomie": cyberware
      // is fitted by its own event (the Humanity is rolled) and an injury is
      // drawn by the damage flow — neither would become buyable if the GM
      // opened the shop wider. Ammunition is a box since stage 46c.
      if (entry.category !== 'ammo' && !purchasedSheetRow(entry, null, 'probe')) {
        throw new RealtimeError('NOT_PURCHASABLE');
      }
      const shelf = creationShopVerdict(
        entry,
        current.roleId,
        await creationShopRules(deps, campaignId),
      );
      if (!shelf.allowed) {
        throw new RealtimeError(`CREATION_SHOP_LOCKED:${shelf.tier}:${shelf.roleTool ? 1 : 0}`);
      }
      if (held >= CREATION_PURCHASE_QTY_MAX) throw new RealtimeError('TOO_MANY_ROWS');
      purchases[key] = held + 1;

      const next: CpredCreationDraft = { ...current, purchases };
      const lookup = await purchaseLookup(deps, campaignId, Object.keys(purchases));
      const lines = creationPurchases(next, lookup, deps.ctx.compendium.weaponTypeById);
      if (creationSpentEddies(lines) > creationBudget(data, next)) {
        throw new RealtimeError('NOT_ENOUGH_EDDIES');
      }
    }

    const next: CpredCreationDraft = { ...current, purchases };
    return toDraftView(await saveDraft(deps, campaignId, user.id, next), deps);
  },
});

/**
 * Prices a whole basket in one go. The entries are fetched rather than read out
 * of `ctx.compendium` because a campaign's own rows win over the files, and a
 * wizard that priced them differently from the shop would be a second shop.
 */
async function purchaseLookup(
  deps: RealtimeDeps,
  campaignId: string,
  keys: readonly string[],
): Promise<(entryId: string) => CompendiumEntry | undefined> {
  const byId = new Map<string, CompendiumEntry>();
  // Klucz koszyka amunicji niesie kaliber (`creationBasketKey`) — wpis jest jeden.
  for (const entryId of new Set(keys.map((key) => creationBasketEntry(key).entryId))) {
    const entry = await campaignEntry(deps, campaignId, entryId);
    if (entry) byId.set(entryId, entry);
  }
  return (entryId) => byId.get(entryId);
}

/**
 * The creator's shelf for this campaign (naprawa 3b): street level for everyone,
 * a Role's own tools up to Zawodowe, and the GM's per-entry choices on top — the
 * same rules the wizard filters its list with.
 */
async function creationShopRules(
  deps: RealtimeDeps,
  campaignId: string,
): Promise<CreationShopRules> {
  return {
    roleTools: deps.ctx.shopRules.roleTools,
    overrides: await campaignShopTierOverrides(deps.ctx.prisma, campaignId),
  };
}

/**
 * The GM's rank list (naprawa 2b): players' Kompletny Pakiet drafts only — a
 * Krawędziarz rolls his stats and the GM's own drafts need nobody's approval —
 * waiting ones first. Metadata alone, never another player's choices.
 */
async function creationRankRows(
  deps: RealtimeDeps,
  campaignId: string,
): Promise<CreationRankDraft[]> {
  const rows = await deps.ctx.prisma.characterDraft.findMany({
    where: { campaignId, user: { role: { not: ROLE_GM } } },
    include: { user: true },
  });
  return rows
    .map((row) => ({ row, view: toDraftView(row, deps) }))
    .map(({ row, view }) => ({
      id: row.id,
      userName: row.user.name,
      characterName: view.draft.name.trim(),
      method: view.draft.method,
      rolledStats: CPRED_STAT_IDS.filter((id) => view.draft.statRolls[id] !== undefined),
      skillPoints: creationSkillPool(creationDataOf(deps.ctx.cpred), view.draft),
      methodFixed: view.draft.methodFixed,
      statRankId: view.rankApproved ? row.statRankId : null,
      // A Krawędziarz waits for nobody — only a pool can be pending.
      rankApproved: view.draft.method === 'complete' ? view.rankApproved : true,
    }))
    .sort(
      (a, b) =>
        Number(a.rankApproved) - Number(b.rankApproved) ||
        a.userName.localeCompare(b.userName, 'pl'),
    );
}

/**
 * Pushes the rank list to the GM after anything that may have changed it: a
 * draft started, switched method, renamed, ranked, finished or thrown away.
 * The badge on the „Postacie" tab lives off this, so a player waiting for a
 * pool is seen without anybody pressing „Odśwież".
 */
async function broadcastCreationRanks(deps: RealtimeDeps, campaignId: string): Promise<void> {
  deps.io
    .to(gmRoom(campaignId))
    .emit('creation:ranks-sync', await creationRankRows(deps, campaignId));
  deps.io
    .to(gmRoom(campaignId))
    .emit('creation:permits-sync', await creationPermitRows(deps, campaignId));
}

/**
 * Players who asked for a new character, or hold a consent they have not
 * used yet (24.09). A consent in use shows as a draft row instead.
 */
async function creationPermitRows(
  deps: RealtimeDeps,
  campaignId: string,
): Promise<CreationPermitRow[]> {
  const members = await deps.ctx.prisma.campaignMember.findMany({
    where: { campaignId, creationPermit: { not: null } },
    include: { user: true },
  });
  const drafting = new Set(
    (
      await deps.ctx.prisma.characterDraft.findMany({
        where: { campaignId },
        select: { userId: true },
      })
    ).map((row) => row.userId),
  );
  return members
    .filter((member) => !drafting.has(member.userId))
    .map((member) => ({
      userId: member.userId,
      userName: member.user.name,
      status: member.creationPermit === 'granted' ? ('granted' as const) : ('requested' as const),
      rulesAccepted: member.creationRulesAcceptedAt !== null,
      terms: readTerms(member.creationTerms, deps),
    }))
    .sort(
      (a, b) =>
        Number(a.status === 'granted') - Number(b.status === 'granted') ||
        a.userName.localeCompare(b.userName, 'pl'),
    );
}

export const creationPermitsEvent = defineCreationEvent<undefined, CreationPermitRow[]>({
  name: 'creation:permits',
  role: ROLE_GM,
  handler: async ({ deps, socket }) => creationPermitRows(deps, requireCampaignId(socket.data)),
});

/**
 * The header of my own draft, if there is one (naprawa 3d). The „Postacie" tab
 * asks after every `state:sync`, so a player who pressed F5 mid-wizard sees
 * „Wznów szkic…" instead of a button that reads as „start from scratch".
 * Nothing is created here — that stays with `creation:start`.
 */
export const creationPeekEvent = defineCreationEvent<undefined, CreationDraftPeek | null>({
  name: 'creation:peek',
  handler: async ({ deps, socket, user }) => {
    const campaignId = requireCampaignId(socket.data);
    const row = await loadDraft(deps, campaignId, user.id);
    if (!row) return null;
    const view = toDraftView(row, deps);
    const roleId = view.draft.roleId;
    return {
      id: row.id,
      name: view.draft.name.trim(),
      roleName: roleId
        ? (deps.ctx.cpred.roles.find((entry) => entry.id === roleId)?.name ?? roleId)
        : null,
      method: view.draft.method,
      step: view.draft.step,
      updatedAt: view.updatedAt,
    };
  },
});

export const creationRanksEvent = defineCreationEvent<undefined, CreationRankDraft[]>({
  name: 'creation:ranks',
  role: ROLE_GM,
  handler: async ({ deps, socket }) => creationRankRows(deps, requireCampaignId(socket.data)),
});

export const creationSetRankEvent = defineCreationEvent<
  { draftId: string; statRankId: string },
  void
>({
  name: 'creation:set-rank',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (
      !payload ||
      typeof payload.draftId !== 'string' ||
      !payload.draftId ||
      !creationDataOf(deps.ctx.cpred).statRanks.some((rank) => rank.id === payload.statRankId)
    )
      throw new RealtimeError('INVALID_DATA');
    const row = await deps.ctx.prisma.characterDraft.findFirst({
      where: { id: payload.draftId, campaignId },
    });
    if (!row) throw new RealtimeError('DRAFT_NOT_FOUND');
    // No `revision` bump: the rank lives in its own column, which no player
    // patch can overwrite. A bump would refuse the player's write that was
    // already on its way (or sent after a missed `creation:rank`) as
    // DRAFT_CHANGED, and „Ponów zapis" could never get it through.
    await deps.ctx.prisma.characterDraft.update({
      where: { id: row.id },
      data: { statRankId: payload.statRankId },
    });
    // Only rank metadata, never another player's biography or choices.
    for (const peer of await deps.io.fetchSockets()) {
      if (peer.data.user?.id === row.userId && peer.data.campaign?.id === campaignId) {
        peer.emit('creation:rank', { draftId: row.id, statRankId: payload.statRankId });
      }
    }
    await broadcastCreationRanks(deps, campaignId);
  },
});

async function finishResult(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  placeToken: boolean,
): Promise<CreationFinishResult> {
  let tokenStatus: CreationFinishResult['tokenStatus'] = 'not-requested';
  if (!character.playReady && !character.creationTokenDone && placeToken) {
    // Decyzja MG z 24.09: the figure walks on at „Przyjmij do gry".
    tokenStatus = 'awaiting-gm';
  } else if (character.creationTokenDone) {
    if (await deps.ctx.prisma.token.findFirst({ where: { characterId: character.id } }))
      tokenStatus = 'placed';
  } else if (placeToken) {
    try {
      const scene = await getActiveScene(deps.ctx.prisma, campaignId);
      if (!scene) tokenStatus = 'no-scene';
      else {
        await createCharacterToken(deps, campaignId, scene, character, true);
        tokenStatus = 'placed';
      }
    } catch (error) {
      deps.log.error({ err: error, characterId: character.id }, 'creation token placement failed');
      tokenStatus = 'failed';
    }
  }
  const view = toCharacterView(character, deps.ctx.cpred);
  await emitCharacterUpsert(deps, campaignId, view);
  return { ...view, tokenStatus };
}

/**
 * The figure a waiting character asked for, placed when the GM lets it into
 * play (24.09). Without an active scene it stays owed — `creationTokenDone`
 * is still false — and `placeOwedCreationTokens` pays it on the next
 * `scene:activate` (#9, 26.09): the wizard promised „Żeton stanie… gdy MG
 * przyjmie", and before that nobody was told the promise had lapsed.
 */
export async function placeApprovedCreationToken(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
): Promise<void> {
  if (character.creationTokenDone || character.creationDraftId === null) return;
  const scene = await getActiveScene(deps.ctx.prisma, campaignId);
  if (!scene) return;
  await payCreationToken(deps, campaignId, scene, character);
}

/**
 * Every figure still owed to a character let into play without an active
 * scene (#9), placed on the scene the GM has just activated. A character still
 * waiting for „Przyjmij do gry" is not owed yet — its figure walks on then.
 */
export async function placeOwedCreationTokens(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
): Promise<void> {
  const owed = await deps.ctx.prisma.character.findMany({
    where: {
      campaignId,
      playReady: true,
      creationTokenDone: false,
      creationDraftId: { not: null },
    },
    orderBy: { createdAt: 'asc' },
  });
  for (const character of owed) await payCreationToken(deps, campaignId, scene, character);
}

async function payCreationToken(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  character: Character,
): Promise<void> {
  // A figure that already stands somewhere (the GM placed it by hand before
  // `token:create` started paying the debt) closes it without a second one.
  if (await deps.ctx.prisma.token.findFirst({ where: { characterId: character.id } })) {
    await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data: { creationTokenDone: true },
    });
    return;
  }
  try {
    await createCharacterToken(deps, campaignId, scene, character, true);
  } catch (error) {
    deps.log.error({ err: error, characterId: character.id }, 'approved token placement failed');
  }
}

/**
 * Turns the draft into a real sheet. The validation runs here again, on the
 * server's copy of the tables — the wizard's greyed-out button is a courtesy,
 * not a gate.
 *
 * Stage 25c added the two things that make the result playable rather than
 * merely correct: the starting money and its shopping go through the **same**
 * `applyBalance` as every later purchase (so session zero leaves an audit
 * trail, not a mystery balance), and the finished character walks onto the map.
 */
export const creationFinishEvent = defineCreationEvent<CreationFinishPayload, CreationFinishResult>(
  {
    name: 'creation:finish',
    handler: async ({ deps, socket, user, payload }) => {
      const campaignId = requireCampaignId(socket.data);
      const data = creationDataOf(deps.ctx.cpred);
      if (payload?.draftId) {
        const completed = await deps.ctx.prisma.character.findUnique({
          where: { creationDraftId: payload.draftId },
        });
        if (completed) {
          if (completed.campaignId !== campaignId || completed.creationUserId !== user.id)
            throw new RealtimeError('DRAFT_NOT_FOUND');
          return finishResult(deps, campaignId, completed, !completed.creationTokenDone);
        }
      }
      const existing = await loadDraft(deps, campaignId, user.id);
      if (!existing || (payload?.draftId && payload.draftId !== existing.id))
        throw new RealtimeError('DRAFT_NOT_FOUND');
      const draft = toDraftView(existing, deps).draft;
      if (
        draft.method === 'complete' &&
        !toDraftView(existing, deps).rankApproved &&
        user.role !== ROLE_GM
      )
        throw new RealtimeError('CREATION_RANK_PENDING');
      const lookup = await purchaseLookup(deps, campaignId, [
        ...Object.keys(draft.purchases),
        ...kitEntryIds(draft, data),
      ]);
      const shopRules = await creationShopRules(deps, campaignId);
      if (
        creationIssues(draft, data, deps.ctx.cpred, lookup, shopRules, {
          requirePurchases: user.role !== ROLE_GM,
        }).length > 0
      ) {
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

      // Rent is for a character somebody plays; the GM's NPC stays off the bill.
      const sheet = withKitRows(
        creationToCharacterData(
          draft,
          data,
          creationLifestyle(deps.ctx.cpred, draft.roleId, ownerId !== null),
        ),
        creationKitSheetRows(
          creationRoleKit(draft, data, lookup),
          lookup,
          deps.ctx.compendium,
          nextRowId,
        ),
      );
      const character = await deps.ctx.prisma.$transaction(async (tx) => {
        if (draft.portraitUrl && user.role !== ROLE_GM) {
          if (
            !(await tx.portraitAsset.findFirst({ where: { campaignId, url: draft.portraitUrl } }))
          ) {
            throw new RealtimeError('PORTRAIT_NOT_AVAILABLE');
          }
          if ((await usedPortraitUrls(tx, campaignId, user.id)).has(draft.portraitUrl)) {
            throw new RealtimeError('PORTRAIT_TAKEN');
          }
        }
        const created = await tx.character.create({
          data: {
            campaignId,
            creationDraftId: existing.id,
            creationUserId: user.id,
            creationTokenDone: !draft.placeToken,
            // Naprawa 3c: postać, którą ktoś będzie grał, czeka na MG. Karta
            // bez właściciela to NPC MG — przed samym sobą nie ma czego
            // zatwierdzać, a lista gotowości zapełniłaby się statystami. Od
            // 24.09 czekanie blokuje, więc postać zrobioną ręką MG MG już
            // zatwierdził — tym, że ją zrobił.
            playReady: ownerId === null || user.role === ROLE_GM,
            name,
            ownerId,
            portraitUrl: draft.portraitUrl,
            data: JSON.stringify(sheet),
          },
        });
        await payStartingKit(deps, campaignId, created, sheet, draft, data, lookup, user.id, tx);
        await tx.characterDraft.delete({ where: { id: existing.id } });
        // The consent bought one character (24.09); the next one is asked for.
        if (user.role !== ROLE_GM) {
          await tx.campaignMember.updateMany({
            where: { campaignId, userId: user.id },
            data: { creationPermit: null, creationRulesAcceptedAt: null },
          });
        }
        return tx.character.findUniqueOrThrow({ where: { id: created.id } });
      });
      if (user.role !== ROLE_GM) await broadcastCreationRanks(deps, campaignId);

      return finishResult(deps, campaignId, character, draft.placeToken);
    },
  },
);

/**
 * Pays out the starting money and spends it, one ledger row at a time.
 *
 * The wallet starts at zero and is credited rather than simply set, so the
 * audit answers „skąd te 2550 ed" from the first line instead of starting
 * mid-story. Each basket line then goes down the ordinary purchase path.
 */
async function payStartingKit(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  startingSheet: CpredCharacterData,
  draft: CpredCreationDraft,
  data: ReturnType<typeof creationDataOf>,
  lookup: (entryId: string) => CompendiumEntry | undefined,
  actorId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  let sheet = await applyBalance(
    deps,
    campaignId,
    character,
    startingSheet,
    {
      kind: 'starting',
      amount: creationBudget(data, draft),
      label: CPRED_CREATION_METHOD_LABELS[draft.method],
    },
    actorId,
    { emit: false, tx },
  );

  for (const line of creationPurchases(draft, lookup, deps.ctx.compendium.weaponTypeById)) {
    const { entryId, weaponTypeId } = creationBasketEntry(line.entryId);
    const entry = lookup(entryId);
    if (!entry) throw new RealtimeError('ENTRY_NOT_FOUND');
    if (entry.category === 'ammo') {
      // Etap 46c: `qty` paczek to jedno pudełko, sklejone z takim samym.
      const type = weaponTypeId ? deps.ctx.compendium.weaponTypeById.get(weaponTypeId) : null;
      const box = type
        ? cpredPurchasedAmmoRow(toAmmoProfile(entry), type, line.qty, nextRowId())
        : null;
      if (!box?.ammo) throw new RealtimeError('NOT_PURCHASABLE');
      const gear = cpredPutAmmo(sheet.gear, { ...box, ammo: box.ammo }, box.qty, nextRowId);
      if (gear.length > ITEM_ROWS_MAX) throw new RealtimeError('TOO_MANY_ROWS');
      sheet = await applyBalance(
        deps,
        campaignId,
        character,
        mergeCharacterData(sheet, { gear }),
        { kind: 'purchase', amount: -line.total, label: `${line.name} ×${box.qty}` },
        actorId,
        { emit: false, tx },
      );
      continue;
    }
    const resolved =
      entry.category === 'weapon'
        ? resolveWeapon(entry, { weaponTypeById: deps.ctx.compendium.weaponTypeById })
        : null;
    let withGoods = sheet;
    for (let copy = 0; copy < line.qty; copy += 1) {
      const purchased = purchasedSheetRow(entry, resolved, nextRowId());
      if (!purchased) throw new RealtimeError('NOT_PURCHASABLE');
      const merged = mergeCharacterData(withGoods, addPurchasedRow(withGoods, purchased));
      if (merged[purchased.list].length !== withGoods[purchased.list].length + 1)
        throw new RealtimeError('TOO_MANY_ROWS');
      withGoods = merged;
    }
    sheet = await applyBalance(
      deps,
      campaignId,
      character,
      withGoods,
      {
        kind: 'purchase',
        amount: -line.total,
        label: line.qty > 1 ? `${line.name} ×${line.qty}` : line.name,
      },
      actorId,
      { emit: false, tx },
    );
  }
  // Etap 48b (decyzja MG z 10.10): dek z pakietu Roli albo z koszyka podpina
  // się sam, a Programy i Ulepszenia wchodzą do gniazd, ile wejdzie — to samo
  // `cpredFitDeckFromGear`, którym podsumowanie liczy `creationOutcome`.
  const fitted = cpredFitDeckFromGear(sheet, lookup, nextRowId);
  if (fitted !== sheet) {
    await tx.character.update({
      where: { id: character.id },
      data: { data: JSON.stringify(fitted) },
    });
  }
}

/**
 * Wyposażenie Roli gratis (etap 47a) leży na karcie od początku — bez wiersza
 * w historii eurodolców, bo nic nie kosztowało. Kolejność jak w `creationOutcome`.
 */
function withKitRows(sheet: CpredCharacterData, rows: readonly PurchasedRow[]): CpredCharacterData {
  return rows.reduce((data, row) => mergeCharacterData(data, addPurchasedRow(data, row)), sheet);
}

/** Id wpisów wyposażenia Roli, które `purchaseLookup` musi pobrać (z wyborem). */
function kitEntryIds(draft: CpredCreationDraft, data: ReturnType<typeof creationDataOf>): string[] {
  const kit = creationRoleKitOf(draft, data);
  return kit ? [...kit.entries, ...kit.choose] : [];
}

function addPurchasedRow(
  data: CpredCharacterData,
  purchased: PurchasedRow,
): Partial<CpredCharacterData> {
  if (purchased.list === 'weapons') return { weapons: [...data.weapons, purchased.row] };
  if (purchased.list === 'armor') return { armor: [...data.armor, purchased.row] };
  return { gear: [...data.gear, purchased.row] };
}

/**
 * Rolls one Lifepath table from the dice cup (stage 25b; one table per throw
 * since the GM's order of 17.09). Only the GM's plain „Rzuć brakujące" sends
 * many at once — one card, one line per question, the die beside each.
 *
 * A table may be thrown again as often as anybody likes: the book says to
 * change a result that does not fit („odpowiednio zmień wynik", s. 44), and
 * the picker beside every row can write any answer anyway.
 *
 * The dice are grouped by their number of sides — the general tables are d10,
 * a Role's are mostly d6 — and the faces are dealt back out in the order the
 * tables were asked for, so the card and the draft cannot disagree about which
 * die answered which question.
 */
export const creationLifepathRollEvent = defineCreationEvent<
  CreationLifepathRollPayload,
  CreationDraftView<CpredCreationDraft>
>({
  name: 'creation:lifepath-roll',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const lifepathData = lifepathDataOf(deps.ctx.cpred);
    const existing = await loadDraft(deps, campaignId, user.id);
    if (!existing) throw new RealtimeError('DRAFT_NOT_FOUND');
    const current = toDraftView(existing, deps).draft;

    const ids = Array.isArray(payload?.tableIds) ? payload.tableIds : [];
    if (ids.length === 0 || ids.length > LIFEPATH_ROLL_TABLES_MAX) {
      throw new RealtimeError('BAD_REQUEST');
    }
    if (ids.length > 1 && user.role !== ROLE_GM) throw new RealtimeError('FORBIDDEN');
    const tables: CpredLifepathTable[] = [];
    for (const id of ids) {
      const table = lifepathTable(lifepathData, current.roleId, id);
      if (table === null) throw new RealtimeError('LIFEPATH_TABLE_UNKNOWN');
      tables.push(table);
    }

    const sides = [...new Set(tables.map((table) => table.sides))];
    const gesture = sanitizeGesture(payload?.gesture);
    const result: RollResult = rollFormula(
      {
        terms: sides.map((count) => ({
          kind: 'dice' as const,
          sign: 1 as const,
          count: tables.filter((table) => table.sides === count).length,
          sides: count,
        })),
      },
      createMixedRng(gesture?.entropy),
      { checkRule: false, plain: true },
    );
    if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
    if (gesture?.toss) result.toss = gesture.toss;
    const faces = new Map<number, number[]>();
    for (const term of result.terms) {
      if (term.kind === 'dice') faces.set(term.sides, [...term.rolls]);
    }

    let lifepath: CpredLifepath = current.lifepath;
    const breakdown: RollBreakdownEntry[] = [];
    for (const table of tables) {
      const face = faces.get(table.sides)?.shift();
      if (face === undefined) continue;
      const entry = lifepathEntryFor(table, face);
      if (entry === null) throw new RealtimeError('LIFEPATH_ROLL_MISSED');
      const next = applyLifepathEntry(lifepath, table, entry, payload?.index);
      if (next === null) throw new RealtimeError('LIFEPATH_TARGET_UNKNOWN');
      lifepath = next;
      breakdown.push({
        label: `${table.label} — ${entry.text}`.slice(0, 120),
        value: face,
        kind: 'lifepath',
      });
    }

    const next: CpredCreationDraft = { ...current, lifepath };
    const saved = await saveDraft(deps, campaignId, user.id, next);
    // One table (every player's throw since 24.09): the card's big number is
    // the die, like any single roll — counting answers printed „1" next to a
    // 5 (#4). Several tables are the GM's shortcut, where the sum of row
    // numbers means nothing, so the card counts answers instead.
    result.total = breakdown.length === 1 ? breakdown[0]!.value : breakdown.length;
    result.breakdown = breakdown;
    // Polish notation, like the stat spread's `10k10`: the two cards of the
    // wizard sit side by side on the chat at session zero.
    result.notation = sides
      .map((count) => `${tables.filter((table) => table.sides === count).length}k${count}`)
      .join(' + ');
    result.title =
      breakdown.length === 1
        ? `Ścieżka Życia — ${tables[0]?.label ?? ''}`
        : `Ścieżka Życia — ${breakdown.length} pytań`;
    if (next.name.trim().length > 0) result.actor = next.name.trim();
    await publishRoll(deps, campaignId, user, result);
    return toDraftView(saved, deps);
  },
});

/**
 * „Rzuć 1k10 i od wyniku odejmij 7" — how many friends, enemies or tragic loves
 * the character has (s. 50–52). One throw, three uses, so one handler.
 */
export const creationLifepathCountEvent = defineCreationEvent<
  CreationLifepathCountPayload,
  CreationDraftView<CpredCreationDraft>
>({
  name: 'creation:lifepath-count',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const group = payload?.group;
    if (!isLifepathGroup(group)) throw new RealtimeError('BAD_REQUEST');
    const lifepathData = lifepathDataOf(deps.ctx.cpred);
    const existing = await loadDraft(deps, campaignId, user.id);
    if (!existing) throw new RealtimeError('DRAFT_NOT_FOUND');
    const current = toDraftView(existing, deps).draft;

    const { sides, modifier } = lifepathData.groupRoll;
    const gesture = sanitizeGesture(payload?.gesture);
    const result: RollResult = rollFormula(
      {
        terms: [
          { kind: 'dice', sign: 1, count: 1, sides },
          { kind: 'modifier', sign: modifier < 0 ? -1 : 1, value: Math.abs(modifier) },
        ],
      },
      createMixedRng(gesture?.entropy),
      { checkRule: false, plain: true },
    );
    if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
    if (gesture?.toss) result.toss = gesture.toss;
    const term = result.terms[0];
    const face = term && term.kind === 'dice' ? (term.rolls[0] ?? 0) : 0;
    const count = lifepathGroupCount(face, lifepathData.groupRoll);
    const next: CpredCreationDraft = {
      ...current,
      lifepath: resizeLifepathGroup(current.lifepath, group, count),
    };
    const saved = await saveDraft(deps, campaignId, user.id, next);

    result.title = `${LIFEPATH_GROUP_LABELS[group]} — ile ich masz`;
    result.notation = `1k${sides} − ${Math.abs(modifier)}`;
    // RAW floors the count at zero, and the card has to say so rather than
    // print „−4" next to a list of nobody.
    result.total = count;
    if (next.name.trim().length > 0) result.actor = next.name.trim();
    await publishRoll(deps, campaignId, user, result);
    return toDraftView(saved, deps);
  },
});

/**
 * Throws the draft away. The wizard asks twice before it gets here. Only the
 * GM's own drafts since 24.09 — a player's creation starts over through the
 * GM's `creation:discard-player`, never by the player's hand.
 */
export const creationDiscardEvent = defineCreationEvent<{ draftId?: string } | undefined, void>({
  name: 'creation:discard',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (user.role !== ROLE_GM) throw new RealtimeError('FORBIDDEN');
    if (payload?.draftId !== undefined && (typeof payload.draftId !== 'string' || !payload.draftId))
      throw new RealtimeError('BAD_REQUEST');
    const removed = await deps.ctx.prisma.characterDraft.deleteMany({
      where: { campaignId, userId: user.id, ...(payload?.draftId ? { id: payload.draftId } : {}) },
    });
    if (removed.count > 0 && user.role !== ROLE_GM) await broadcastCreationRanks(deps, campaignId);
  },
});
