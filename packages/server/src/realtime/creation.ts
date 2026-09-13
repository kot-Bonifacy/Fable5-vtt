import type {
  ChatMessageView,
  CharacterView,
  CompendiumEntry,
  CpredCharacterData,
  CpredCreationDraft,
  CpredCreationRole,
  CpredLifepath,
  CpredLifepathTable,
  CpredStatId,
  CreationBuyPayload,
  CreationDraftView,
  CreationFinishPayload,
  CreationLifepathCountPayload,
  CreationLifepathRollPayload,
  CreationPatchPayload,
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
  CREATION_PURCHASE_QTY_MAX,
  CREATION_SHOP_TIER,
  LIFEPATH_GROUP_LABELS,
  LIFEPATH_ROLL_TABLES_MAX,
  ROLE_GM,
  applyLifepathEntry,
  applyRolledSpread,
  createDefaultCreationDraft,
  creationBudget,
  creationDataOf,
  creationIssues,
  creationPurchases,
  creationRole,
  creationSpentEddies,
  creationToCharacterData,
  entryPrice,
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
  shopTierOf,
} from '@vtt/shared';
import type { Character, CharacterDraft } from '../generated/prisma/client.js';
import { usedPortraitUrls } from '../portraits.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { createMixedRng } from './dice-rng.js';
import { sanitizeGesture } from './chat.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { campaignEntry } from './compendium.js';
import { applyBalance, nextRowId } from './economy.js';
import { getActiveScene } from './scenes.js';
import { requireUnlockedTier } from './shop.js';
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
    // Rezerwacja i sprawdzenie w jednej transakcji: równoczesny wybór nie
    // może przydzielić tej samej twarzy dwóm szkicom.
    const saved = await deps.ctx.prisma.$transaction(async (tx) => {
      if ('portraitUrl' in patch && next.portraitUrl && user.role !== ROLE_GM) {
        const asset = await tx.portraitAsset.findFirst({
          where: { campaignId, url: next.portraitUrl },
        });
        if (!asset) throw new RealtimeError('PORTRAIT_NOT_AVAILABLE');
        if ((await usedPortraitUrls(tx, campaignId, user.id)).has(next.portraitUrl)) {
          throw new RealtimeError('PORTRAIT_TAKEN');
        }
      }
      return tx.characterDraft.update({
        where: { id: existing.id },
        data: { data: JSON.stringify(next) },
      });
    });
    return toDraftView(saved, deps);
  },
});

/**
 * Rolls the whole spread: one 1d10 per stat, each read out of the Role's
 * template column (s. 77). One card rather than ten — the breakdown names
 * every stat and the total is the spread's point value, which is the number a
 * table actually compares (62 is what Kompletny Pakiet gets to spend).
 */
export const creationRollEvent = defineEvent<
  CreationRollPayload,
  CreationDraftView<CpredCreationDraft>
>({
  name: 'creation:roll',
  handler: async ({ deps, socket, user, payload }) => {
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
    //
    // The cup's shake is mixed into the seed exactly as it is for a sheet
    // check: the hand picks which of the equally likely spreads comes out, and
    // the server still decides what „equally likely" means. A GM pressing the
    // plain button rolls without a gesture and the seed is simply all-server.
    //
    // `plain` (stage 27d) is what stops the card from painting the tens green
    // and the ones red: these dice are template columns, not Checks, and a 10
    // here means „the tenth spread", not a critical.
    const gesture: RollGesture | undefined = sanitizeGesture(payload?.gesture);
    const result: RollResult = rollFormula(
      { terms: [{ kind: 'dice', count: CPRED_STAT_IDS.length, sides: 10, sign: 1 }] },
      createMixedRng(gesture?.entropy),
      { checkRule: false, plain: true },
    );
    if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
    if (gesture?.toss) result.toss = gesture.toss;
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
  await publishRoll(deps, campaignId, userId, result);
}

/** Puts a finished roll on the chat, where the whole table can check it. */
async function publishRoll(
  deps: RealtimeDeps,
  campaignId: string,
  userId: string,
  result: RollResult,
): Promise<void> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: userId,
      kind: 'roll',
      text: result.title ?? 'Rzut',
      payload: JSON.stringify(result),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  const view: ChatMessageView = toChatMessageView(stored);
  await deliverRollMessage(deps, campaignId, userId, view);
}

/**
 * The starting shop (stage 25c) — one item into or out of the basket.
 *
 * Everything that decides anything happens here: the price comes off the
 * catalogue, the budget off the method, and the tier is fixed at street level
 * for **everybody, the GM included**. That last one is deliberate and the only
 * blocked path in the project a GM does not walk through: a starting kit
 * limited to what any kiosk sells is the whole point of the restriction (the
 * GM's wish, 14.08), and an exemption would turn it into a suggestion. The GM
 * can still hand a new character a rifle afterwards — „Dodaj za darmo" on the
 * catalogue card has never asked anybody's permission.
 */
export const creationBuyEvent = defineEvent<
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

    const entryId = payload?.entryId;
    if (typeof entryId !== 'string' || entryId.length === 0) throw new RealtimeError('BAD_REQUEST');
    const delta = payload?.delta;
    if (delta !== 1 && delta !== -1) throw new RealtimeError('BAD_REQUEST');

    const purchases = { ...current.purchases };
    const held = purchases[entryId] ?? 0;
    if (delta === -1) {
      if (held <= 1) delete purchases[entryId];
      else purchases[entryId] = held - 1;
    } else {
      const entry = await campaignEntry(deps, campaignId, entryId);
      if (!entry) throw new RealtimeError('ENTRY_NOT_FOUND');
      if (entryPrice(entry) === null) throw new RealtimeError('NO_PRICE');
      // „Tego się tu nie kupuje" comes before „nie na tym poziomie": cyberware
      // is fitted by its own event (the Humanity is rolled), a cartridge is
      // loaded into a weapon and an injury is drawn by the damage flow — none
      // of the three would become buyable if the GM opened the shop wider.
      if (!purchasedSheetRow(entry, null, 'probe')) throw new RealtimeError('NOT_PURCHASABLE');
      requireUnlockedTier(shopTierOf(entry), CREATION_SHOP_TIER);
      if (held >= CREATION_PURCHASE_QTY_MAX) throw new RealtimeError('TOO_MANY_ROWS');
      purchases[entryId] = held + 1;

      const next: CpredCreationDraft = { ...current, purchases };
      const lookup = await purchaseLookup(deps, campaignId, Object.keys(purchases));
      if (creationSpentEddies(creationPurchases(next, lookup)) > creationBudget(data, next)) {
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
  entryIds: readonly string[],
): Promise<(entryId: string) => CompendiumEntry | undefined> {
  const byId = new Map<string, CompendiumEntry>();
  for (const entryId of entryIds) {
    const entry = await campaignEntry(deps, campaignId, entryId);
    if (entry) byId.set(entryId, entry);
  }
  return (entryId) => byId.get(entryId);
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
export const creationFinishEvent = defineEvent<CreationFinishPayload, CharacterView>({
  name: 'creation:finish',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const data = creationDataOf(deps.ctx.cpred);
    const existing = await loadDraft(deps, campaignId, user.id);
    if (!existing) throw new RealtimeError('DRAFT_NOT_FOUND');

    const draft = toDraftView(existing, deps).draft;
    const lookup = await purchaseLookup(deps, campaignId, Object.keys(draft.purchases));
    if (creationIssues(draft, data, deps.ctx.cpred, lookup).length > 0) {
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
          name,
          ownerId,
          portraitUrl: draft.portraitUrl,
          data: JSON.stringify(creationToCharacterData(draft, data)),
        },
      });
      await tx.characterDraft.delete({ where: { id: existing.id } });
      return created;
    });

    await payStartingKit(deps, campaignId, character, draft, data, lookup, user.id);

    // Re-read: the sheet has been rewritten once per basket line above.
    const saved =
      (await deps.ctx.prisma.character.findUnique({ where: { id: character.id } })) ?? character;
    if (draft.placeToken) {
      const scene = await getActiveScene(deps.ctx.prisma, campaignId);
      // No active scene is not an error — the character is finished either way,
      // and „nie udało się utworzyć postaci" would be a lie about a token.
      if (scene) await createCharacterToken(deps, campaignId, scene, saved);
    }

    const view = toCharacterView(saved, deps.ctx.cpred);
    await emitCharacterUpsert(deps, campaignId, view);
    return view;
  },
});

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
  draft: CpredCreationDraft,
  data: ReturnType<typeof creationDataOf>,
  lookup: (entryId: string) => CompendiumEntry | undefined,
  actorId: string,
): Promise<void> {
  let sheet = creationToCharacterData(draft, data);
  sheet = await applyBalance(
    deps,
    campaignId,
    character,
    sheet,
    {
      kind: 'starting',
      amount: creationBudget(data, draft),
      label: CPRED_CREATION_METHOD_LABELS[draft.method],
    },
    actorId,
    { emit: false },
  );

  for (const line of creationPurchases(draft, lookup)) {
    const entry = lookup(line.entryId);
    if (!entry) continue;
    const resolved =
      entry.category === 'weapon'
        ? resolveWeapon(entry, { weaponTypeById: deps.ctx.compendium.weaponTypeById })
        : null;
    let withGoods = sheet;
    for (let copy = 0; copy < line.qty; copy += 1) {
      const purchased = purchasedSheetRow(entry, resolved, nextRowId());
      if (!purchased) continue;
      withGoods = mergeCharacterData(withGoods, addPurchasedRow(withGoods, purchased));
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
      { emit: false },
    );
  }
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
 * Rolls one or many Lifepath tables in a single throw (stage 25b).
 *
 * Many, because that is how a table uses this chapter: „Rzuć całą Ścieżkę"
 * answers fourteen questions at once, and fourteen separate chat cards would
 * bury the session zero the cards exist to document. One card, one line per
 * question, the die result beside each.
 *
 * The dice are grouped by their number of sides — the general tables are d10,
 * a Role's are mostly d6 — and the faces are dealt back out in the order the
 * tables were asked for, so the card and the draft cannot disagree about which
 * die answered which question.
 */
export const creationLifepathRollEvent = defineEvent<
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
    const tables: CpredLifepathTable[] = [];
    for (const id of ids) {
      const table = lifepathTable(lifepathData, current.roleId, id);
      if (table === null) throw new RealtimeError('LIFEPATH_TABLE_UNKNOWN');
      tables.push(table);
    }

    const sides = [...new Set(tables.map((table) => table.sides))];
    const result: RollResult = rollFormula(
      {
        terms: sides.map((count) => ({
          kind: 'dice' as const,
          sign: 1 as const,
          count: tables.filter((table) => table.sides === count).length,
          sides: count,
        })),
      },
      createMixedRng(),
      { checkRule: false, plain: true },
    );
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
    // The dice sum means nothing (the faces are row numbers), so the card
    // counts answers instead — the same reasoning as the stat spread above.
    result.total = breakdown.length;
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
    await publishRoll(deps, campaignId, user.id, result);
    return toDraftView(saved, deps);
  },
});

/**
 * „Rzuć 1k10 i od wyniku odejmij 7" — how many friends, enemies or tragic loves
 * the character has (s. 50–52). One throw, three uses, so one handler.
 */
export const creationLifepathCountEvent = defineEvent<
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
    const result: RollResult = rollFormula(
      {
        terms: [
          { kind: 'dice', sign: 1, count: 1, sides },
          { kind: 'modifier', sign: modifier < 0 ? -1 : 1, value: Math.abs(modifier) },
        ],
      },
      createMixedRng(),
      { checkRule: false, plain: true },
    );
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
    await publishRoll(deps, campaignId, user.id, result);
    return toDraftView(saved, deps);
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
