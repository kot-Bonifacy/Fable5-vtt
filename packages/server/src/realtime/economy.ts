import type {
  ChatMessageView,
  CompendiumEntry,
  CpredCharacterData,
  EconomyAdjustPayload,
  EconomyBuyPayload,
  EconomyHistoryPayload,
  EconomyHistoryResult,
  EconomyLogEntry,
  EconomySettlePayload,
  EconomyTransferPayload,
  LedgerKind,
  SessionUser,
} from '@vtt/shared';
import {
  EDDIES_MAX,
  ITEM_ROWS_MAX,
  LEDGER_KIND_LABELS,
  ROLE_GM,
  entryPrice,
  formatEddies,
  formatLedgerAmount,
  isLedgerKind,
  mergeCharacterData,
  monthlyCostOf,
  parseCharacterData,
  purchasedSheetRow,
  resolveWeapon,
  settleMonth,
} from '@vtt/shared';
import type { Character } from '../generated/prisma/client.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { INCLUDE_CHAT_NAMES, deliverChatMessageTo, toChatMessageView } from './chat-io.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitTokensOfCharacter } from './tokens.js';

/**
 * Eddies (stage 23b).
 *
 * The rule the whole module exists to enforce: **a balance is written by the
 * server or not at all**. Until this stage the sheet had a number field and
 * whoever owned the sheet typed into it, which made „gdzie się podziały
 * pieniądze" unanswerable halfway through a session. Now every path that moves
 * money goes through `applyBalance`, and every one of them leaves a ledger row
 * naming itself — including the GM's own correction, which is the one hole that
 * would otherwise make the audit decorative.
 *
 * Purchases are self-service (decision of the GM, 09.08.2026): a player clicks
 * „Kup" and the server checks the wallet. What the GM keeps is the *free* add
 * from stage 13 — loot, starting gear, a reward — which stays a plain sheet
 * edit and is deliberately not a transaction.
 */

/** Ledger rows the sheet asks for; the audit list is short by design. */
const LEDGER_PAGE_SIZE = 30;

/**
 * A GM correction typed a digit at a time would fill the audit with „500 →
 * 50 → 5". Within this window the same GM's correction of the same wallet is
 * rewritten instead of appended, so the list holds one row per intention.
 */
const ADJUST_MERGE_MS = 60_000;

/** What one write to a wallet has to say for itself. */
export interface BalanceChange {
  kind: LedgerKind;
  /** Signed: negative is money leaving the character. */
  amount: number;
  /** Polish one-liner for the audit: „Zgrzyt 9", „Czynsz — Kontener". */
  label: string;
  counterpartyId?: string;
}

/**
 * Moves a balance and records why, in that order and never one without the
 * other. Returns the sheet as saved, so callers can read the new balance
 * without a second query.
 *
 * `merge` is the GM-correction case described at `ADJUST_MERGE_MS`; the merged
 * row keeps its original „before" so the amount stays the truth of the whole
 * edit rather than of its last keystroke.
 */
export async function applyBalance(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  data: CpredCharacterData,
  change: BalanceChange,
  actorId: string,
  options: { merge?: boolean; emit?: boolean } = {},
): Promise<CpredCharacterData> {
  const balance = clampEddies(data.eddies + change.amount);
  const updated = mergeCharacterData(data, { eddies: balance });
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: JSON.stringify(updated) },
  });

  const previous = options.merge ? await lastMergeableAdjust(deps, character.id, actorId) : null;
  if (previous) {
    await deps.ctx.prisma.ledgerEntry.update({
      where: { id: previous.id },
      data: {
        amount: balance - (previous.balance - previous.amount),
        balance,
        label: change.label,
      },
    });
  } else {
    await deps.ctx.prisma.ledgerEntry.create({
      data: {
        campaignId,
        characterId: character.id,
        kind: change.kind,
        amount: change.amount,
        balance,
        label: change.label,
        ...(change.counterpartyId ? { counterpartyId: change.counterpartyId } : {}),
        actorId,
      },
    });
  }

  if (options.emit !== false) {
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    // The sheet is the token's source of truth (stage 08). Money moves nothing
    // on a token today, but a character upsert without the token refresh has
    // bitten this project before, and a wallet is one write like any other.
    await emitTokensOfCharacter(deps, campaignId, saved);
  }
  return updated;
}

/** The sheet may not hold an absurd number, and never a negative one. */
function clampEddies(value: number): number {
  return Math.max(0, Math.min(EDDIES_MAX, Math.round(value)));
}

async function lastMergeableAdjust(
  deps: RealtimeDeps,
  characterId: string,
  actorId: string,
): Promise<{ id: number; amount: number; balance: number } | null> {
  const row = await deps.ctx.prisma.ledgerEntry.findFirst({
    where: { characterId },
    orderBy: { id: 'desc' },
    select: { id: true, kind: true, amount: true, balance: true, actorId: true, createdAt: true },
  });
  if (!row || row.kind !== 'adjust' || row.actorId !== actorId) return null;
  if (Date.now() - row.createdAt.getTime() > ADJUST_MERGE_MS) return null;
  return { id: row.id, amount: row.amount, balance: row.balance };
}

/** The character, refused unless the caller may spend from its wallet. */
async function requireWallet(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  characterId: unknown,
): Promise<Character> {
  if (typeof characterId !== 'string' || characterId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const character = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
  // A character of another campaign — or of nobody — is indistinguishable from
  // one that does not exist. This is also what refuses a transfer to a sheet
  // outside the session, which is a thing a typo can otherwise do.
  if (!character || character.campaignId !== campaignId) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  if (user.role !== ROLE_GM && character.ownerId !== user.id) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  return character;
}

/** Posts the private card: GM plus whoever the money belonged to. */
async function postEconomyCard(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  entry: EconomyLogEntry,
  recipients: (string | null | undefined)[],
): Promise<number> {
  // The first recipient rides along as `recipientId` so the line survives in
  // history for them; targeted delivery alone would vanish on a reload.
  const recipientId = recipients.find((id) => typeof id === 'string' && id !== user.id) ?? null;
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: user.id,
      kind: 'economy',
      text: entry.title,
      payload: JSON.stringify(entry),
      recipientId,
    },
    include: INCLUDE_CHAT_NAMES,
  });
  const view: ChatMessageView = toChatMessageView(stored);
  await deliverChatMessageTo(deps, campaignId, view, recipients, true);
  return view.id;
}

/** „Rico — Zgrzyt 9 · −100 ed · saldo 400 ed" */
function ledgerLine(name: string, label: string, amount: number, balance: number): string {
  return `${name} — ${label} · ${formatLedgerAmount(amount)} · saldo ${formatEddies(balance)} ed`;
}

/* ------------------------------------------------------------------ *
 * Buying
 * ------------------------------------------------------------------ */

export const economyBuyEvent = defineEvent<EconomyBuyPayload, { balance: number }>({
  name: 'economy:buy',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const character = await requireWallet(deps, campaign.id, user, payload?.characterId);
    const entry: CompendiumEntry | undefined = deps.ctx.compendium.entryById.get(
      typeof payload?.entryId === 'string' ? payload.entryId : '',
    );
    if (!entry) throw new RealtimeError('ENTRY_NOT_FOUND');

    const price = resolvePrice(entry, payload?.price, user);
    const data = parseCharacterData(character.data, deps.ctx.cpred);

    const resolved =
      entry.category === 'weapon'
        ? resolveWeapon(entry, { weaponTypeById: deps.ctx.compendium.weaponTypeById })
        : null;
    const purchased = purchasedSheetRow(entry, resolved, nextRowId());
    // Cyberware is fitted by `character:cyberware`, a cartridge is loaded into a
    // weapon and an injury is drawn by the damage flow — none of the three is
    // bought here, and a wallet emptied for a row nobody can carry would be the
    // worst possible way to find that out.
    if (!purchased) throw new RealtimeError('NOT_PURCHASABLE');
    if (data[purchased.list].length >= ITEM_ROWS_MAX) throw new RealtimeError('TOO_MANY_ROWS');
    if (data.eddies < price) throw new RealtimeError('NOT_ENOUGH_EDDIES');

    // Goods first, in the same write as the money: `applyBalance` saves the
    // sheet it is handed, so the row and the payment cannot come apart.
    const patch: Partial<CpredCharacterData> =
      purchased.list === 'weapons'
        ? { weapons: [...data.weapons, purchased.row] }
        : purchased.list === 'armor'
          ? { armor: [...data.armor, purchased.row] }
          : { gear: [...data.gear, purchased.row] };
    const withItem = mergeCharacterData(data, patch);
    const updated = await applyBalance(
      deps,
      campaign.id,
      character,
      withItem,
      { kind: 'purchase', amount: -price, label: entry.name },
      user.id,
    );

    await postEconomyCard(
      deps,
      campaign.id,
      user,
      {
        title: `${LEDGER_KIND_LABELS.purchase} — ${entry.name}`,
        lines: [ledgerLine(character.name, entry.name, -price, updated.eddies)],
      },
      [character.ownerId],
    );
    return { balance: updated.eddies };
  },
});

/**
 * The price actually charged. The printed number, the band's price when the
 * entry has only a band (s. 342), or the GM's own figure — a player sending one
 * is refused rather than quietly ignored, because a silently dropped override
 * looks exactly like a working discount.
 */
function resolvePrice(entry: CompendiumEntry, override: unknown, user: SessionUser): number {
  if (override !== undefined) {
    if (user.role !== ROLE_GM) throw new RealtimeError('FORBIDDEN');
    if (typeof override !== 'number' || !Number.isInteger(override) || override < 0) {
      throw new RealtimeError('BAD_REQUEST');
    }
    if (override > EDDIES_MAX) throw new RealtimeError('BAD_REQUEST');
    return override;
  }
  const price = entryPrice(entry);
  // „Cena: —" in the catalogue is a row nobody finished typing, not a freebie.
  if (price === null) throw new RealtimeError('NO_PRICE');
  return price;
}

/** Row ids are short and random, exactly like the ones the sheet editor mints. */
function nextRowId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/* ------------------------------------------------------------------ *
 * Transfers
 * ------------------------------------------------------------------ */

export const economyTransferEvent = defineEvent<EconomyTransferPayload, { balance: number }>({
  name: 'economy:transfer',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const from = await requireWallet(deps, campaign.id, user, payload?.fromCharacterId);
    // The payee is *not* run through `requireWallet`: you may pay somebody
    // whose sheet you cannot read. What still has to hold is that they play in
    // this campaign — which is what refuses a transfer to an outside sheet.
    const toId = payload?.toCharacterId;
    if (typeof toId !== 'string' || toId.length === 0) throw new RealtimeError('BAD_REQUEST');
    if (toId === from.id) throw new RealtimeError('BAD_REQUEST');
    const to = await deps.ctx.prisma.character.findUnique({ where: { id: toId } });
    if (!to || to.campaignId !== campaign.id) throw new RealtimeError('CHARACTER_NOT_FOUND');

    const amount = payload?.amount;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      throw new RealtimeError('BAD_REQUEST');
    }
    if (amount > EDDIES_MAX) throw new RealtimeError('BAD_REQUEST');

    const fromData = parseCharacterData(from.data, deps.ctx.cpred);
    if (fromData.eddies < amount) throw new RealtimeError('NOT_ENOUGH_EDDIES');
    const note = typeof payload?.note === 'string' ? payload.note.trim().slice(0, 120) : '';
    const suffix = note ? ` · ${note}` : '';

    const fromAfter = await applyBalance(
      deps,
      campaign.id,
      from,
      fromData,
      {
        kind: 'transfer',
        amount: -amount,
        label: `do: ${to.name}${suffix}`,
        counterpartyId: to.id,
      },
      user.id,
    );
    const toData = parseCharacterData(to.data, deps.ctx.cpred);
    const toAfter = await applyBalance(
      deps,
      campaign.id,
      to,
      toData,
      { kind: 'transfer', amount, label: `od: ${from.name}${suffix}`, counterpartyId: from.id },
      user.id,
    );

    await postEconomyCard(
      deps,
      campaign.id,
      user,
      {
        title: LEDGER_KIND_LABELS.transfer,
        lines: [
          `${from.name} → ${to.name}: ${formatEddies(amount)} ed${suffix}`,
          ledgerLine(from.name, `do: ${to.name}`, -amount, fromAfter.eddies),
          ledgerLine(to.name, `od: ${from.name}`, amount, toAfter.eddies),
        ],
      },
      [from.ownerId, to.ownerId],
    );
    return { balance: fromAfter.eddies };
  },
});

/* ------------------------------------------------------------------ *
 * GM correction
 * ------------------------------------------------------------------ */

export const economyAdjustEvent = defineEvent<EconomyAdjustPayload, { balance: number }>({
  name: 'economy:adjust',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const character = await requireWallet(deps, campaign.id, user, payload?.characterId);
    const balance = payload?.balance;
    if (
      typeof balance !== 'number' ||
      !Number.isInteger(balance) ||
      balance < 0 ||
      balance > EDDIES_MAX
    ) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const data = parseCharacterData(character.data, deps.ctx.cpred);
    const delta = balance - data.eddies;
    if (delta === 0) return { balance };

    const reason = typeof payload?.reason === 'string' ? payload.reason.trim().slice(0, 120) : '';
    const updated = await applyBalance(
      deps,
      campaign.id,
      character,
      data,
      { kind: 'adjust', amount: delta, label: reason || 'korekta MG' },
      user.id,
      { merge: true },
    );
    return { balance: updated.eddies };
  },
});

/* ------------------------------------------------------------------ *
 * The first of the month
 * ------------------------------------------------------------------ */

export const economySettleEvent = defineEvent<
  EconomySettlePayload,
  { charged: number; shortfall: number; settled: number; skipped: number }
>({
  name: 'economy:settle',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const preview = payload?.preview === true;
    const characters = await deps.ctx.prisma.character.findMany({
      where: { campaignId: campaign.id },
      orderBy: { name: 'asc' },
    });

    const lines: string[] = [];
    let charged = 0;
    let shortfall = 0;
    let settled = 0;
    let skipped = 0;

    for (const character of characters) {
      const data = parseCharacterData(character.data, deps.ctx.cpred);
      // No lifestyle on the sheet means „ta postać nie prowadzi rachunków".
      // Mannequins and one-scene gangers must not grow a rent line.
      if (!data.lifestyle) {
        skipped += 1;
        continue;
      }
      const cost = monthlyCostOf(data.lifestyle);
      const result = settleMonth(data.eddies, data.lifestyle);
      settled += 1;
      charged += result.charged;
      shortfall += result.shortfall;

      const label =
        `Poziom życia ${formatEddies(cost.lifestyle)} ed + ` +
        `czynsz ${formatEddies(cost.rent)} ed`;
      if (preview) {
        lines.push(
          `${character.name} — ${label} = ${formatEddies(result.due)} ed · saldo ` +
            `${formatEddies(data.eddies)} ed` +
            (result.shortfall > 0 ? ` · zabraknie ${formatEddies(result.shortfall)} ed` : ''),
        );
        continue;
      }
      const updated = await applyBalance(
        deps,
        campaign.id,
        character,
        data,
        { kind: 'lifestyle', amount: -result.charged, label },
        user.id,
      );
      lines.push(
        ledgerLine(character.name, label, -result.charged, updated.eddies) +
          (result.shortfall > 0 ? ` · NIEDOPŁATA ${formatEddies(result.shortfall)} ed` : ''),
      );
    }

    const summary =
      (preview ? 'Do pobrania: ' : 'Pobrano: ') +
      `${formatEddies(charged)} ed od ${settled} postaci` +
      (shortfall > 0 ? ` · niedopłata razem ${formatEddies(shortfall)} ed` : '') +
      (skipped > 0 ? ` · pominięto ${skipped} bez Poziomu życia` : '');

    // GM only: one card listing everybody's balances is the GM's ledger, not
    // the table's. Each player still sees their own line — on their own sheet,
    // where the audit lives.
    await postEconomyCard(
      deps,
      campaign.id,
      user,
      {
        title: preview ? 'Rozliczenie miesiąca — podgląd' : LEDGER_KIND_LABELS.lifestyle,
        lines: lines.length > 0 ? lines : ['Żadna postać nie ma ustawionego Poziomu życia.'],
        summary,
      },
      [],
    );
    return { charged, shortfall, settled, skipped };
  },
});

/* ------------------------------------------------------------------ *
 * The audit
 * ------------------------------------------------------------------ */

export const economyHistoryEvent = defineEvent<EconomyHistoryPayload, EconomyHistoryResult>({
  name: 'economy:history',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const character = await requireWallet(deps, campaign.id, user, payload?.characterId);
    const rows = await deps.ctx.prisma.ledgerEntry.findMany({
      where: { characterId: character.id },
      orderBy: { id: 'desc' },
      take: LEDGER_PAGE_SIZE,
    });
    // Names only, and everybody's: a player's client holds no sheet but their
    // own, so without this list „przelej Kai 500 ed" has nothing to aim at.
    const payees = await deps.ctx.prisma.character.findMany({
      where: { campaignId: campaign.id, id: { not: character.id } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return {
      payees,
      entries: rows.map((row) => ({
        id: row.id,
        // A row written by a future stage under a kind this build does not know
        // still belongs in the list; it just reads as a correction.
        kind: isLedgerKind(row.kind) ? row.kind : 'adjust',
        amount: row.amount,
        balance: row.balance,
        label: row.label,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  },
});
