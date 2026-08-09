import type {
  CharacterCyberwarePayload,
  ChatMessageView,
  CompendiumEntry,
  CpredCharacterData,
  CpredCyberwareRow,
  CyberwareEntry,
  RollFormula,
  RollGesture,
  RollResult,
  SessionUser,
} from '@vtt/shared';
import {
  CYBERWARE_INSTALL_COST,
  CYBERWARE_INSTALL_LABELS,
  CYBERWARE_TYPE_LABELS,
  HUMANITY_THERAPY_DEFINITIONS,
  ITEM_ROWS_MAX,
  ROLE_GM,
  cyberpsychosisFor,
  cyberwareInstallationFrom,
  entryPrice,
  formatEddies,
  humanityMaxWith,
  isHumanityTherapy,
  mergeCharacterData,
  parseCharacterData,
  parseRollNotation,
  resolveHumanityLoss,
  rollFormula,
} from '@vtt/shared';
import type { Character } from '../generated/prisma/client.js';
import { requireRollableCharacter } from './character-rolls.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import { sanitizeGesture } from './chat.js';
import { createMixedRng } from './dice-rng.js';
import { applyBalance } from './economy.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitTokensOfCharacter } from './tokens.js';

/**
 * Chrome going in and coming out (stage 23a).
 *
 * Why this is a server event and not three sheet edits: the Humanity a piece of
 * cyberware costs is **rolled** („W trakcie gry Utratę Człowieczeństwa określa
 * się, rzucając tyloma kośćmi, ile widnieje w nawiasie", s. 111). A client that
 * could name the number could name a one, and the whole point of the stat is
 * that the player does not get to choose what the ripperdoc took.
 *
 * The three actions share one event because they are one accounting: install
 * lowers the ceiling and the pool, removal raises the ceiling only, therapy
 * refills the pool up to the ceiling. Splitting them would put the same
 * „re-read the sheet, save, broadcast, post a card" four times in a row.
 */

/** The catalogue entry, refused unless it is cyberware this campaign knows. */
function requireCyberwareEntry(deps: RealtimeDeps, entryId: unknown): CyberwareEntry {
  if (typeof entryId !== 'string' || entryId.length === 0) throw new RealtimeError('BAD_REQUEST');
  const entry: CompendiumEntry | undefined = deps.ctx.compendium.entryById.get(entryId);
  if (!entry || entry.category !== 'cyberware') throw new RealtimeError('ENTRY_NOT_FOUND');
  return entry;
}

/** Row ids are short and random, exactly like the ones the sheet editor mints. */
function nextRowId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Rolls a Humanity cost written the way the tables write it.
 *
 * A flat cost still goes through the dice engine as a bare modifier, so the
 * card that lands on the chat looks the same whether the entry said „2k6" or
 * „0" — the table always shows what a piece took, even when it took nothing.
 */
function rollHumanityLoss(
  entry: CyberwareEntry,
  entropy: string | undefined,
): { loss: number; result: RollResult; notation: string } {
  const notation = entry.humanityLoss ?? String(entry.humanityLossFixed ?? 0);
  const parsed = parseRollNotation(notation);
  if (!parsed.ok) throw new RealtimeError('BAD_NOTATION');
  const formula: RollFormula = parsed.formula;
  const result = rollFormula(formula, createMixedRng(entropy), { checkRule: false });
  return {
    loss: resolveHumanityLoss(result.total, entry.humanityLossHalved === true),
    result,
    notation,
  };
}

/** „Człowieczeństwo 43 / 58 · EMP 4" — the line every card here ends with. */
function humanityLine(data: CpredCharacterData): string {
  const max = humanityMaxWith(data.stats, data.cyberware);
  const state = cyberpsychosisFor(data.humanityCurrent);
  const psychosis = state.level === 'none' ? '' : ` · ${state.label}`;
  return `Człowieczeństwo ${data.humanityCurrent} / ${max} · EMP ${state.emp}${psychosis}`;
}

/** Writes the sheet, tells everyone who may see it, and hands back the row. */
async function saveSheet(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  data: CpredCharacterData,
): Promise<void> {
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: JSON.stringify(data) },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  // Humanity does not move HP, but the sheet is the token's source of truth and
  // a character upsert without the token refresh has bitten this project before.
  await emitTokensOfCharacter(deps, campaignId, saved);
}

/** Posts the card the table reads: what was rolled, and where it left the pool. */
async function postCard(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  character: Character,
  result: RollResult,
): Promise<number> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: user.id,
      kind: 'roll',
      text: result.title ?? 'Człowieczeństwo',
      payload: JSON.stringify(result),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  const view: ChatMessageView = toChatMessageView(stored);
  await deliverRollMessage(deps, campaignId, user.id, view);
  return view.id;
}

export const characterCyberwareEvent = defineEvent<
  CharacterCyberwarePayload,
  { messageId: number | null }
>({
  name: 'character:cyberware',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const character = await requireRollableCharacter(deps, campaign.id, user, payload?.characterId);
    const data = parseCharacterData(character.data, deps.ctx.cpred);
    const gesture: RollGesture | undefined = sanitizeGesture(payload?.gesture);

    switch (payload?.action) {
      case 'install':
        return installCyberware(deps, campaign.id, user, character, data, payload, gesture);
      case 'remove':
        return removeCyberware(deps, campaign.id, user, character, data, payload);
      case 'therapy':
        return runTherapy(deps, campaign.id, user, character, data, payload, gesture);
      default:
        throw new RealtimeError('BAD_REQUEST');
    }
  },
});

/**
 * The bill for fitting a piece of chrome (stage 23b).
 *
 * Two rows of the price list, not one: the hardware, and „Montaż znalezionej
 * cyborgizacji" — 100 / 500 / 1000 ed by where it is done (s. 375). They come
 * apart because the rulebook takes them apart: chrome pulled off a corpse costs
 * the ripperdoc's time and nothing else.
 */
function installBill(
  entry: CyberwareEntry,
  payment: CharacterCyberwarePayload['payment'],
  user: SessionUser,
): { cost: number; label: string } {
  const fitting = entry.install ? CYBERWARE_INSTALL_COST[entry.install] : 0;
  const fittingLabel = entry.install ? CYBERWARE_INSTALL_LABELS[entry.install] : 'montaż';
  if (payment === 'none') {
    // „Na koszt MG" — a gift, a job's payment in kind, a Trauma Team favour.
    if (user.role !== ROLE_GM) throw new RealtimeError('FORBIDDEN');
    return { cost: 0, label: `${entry.name} — bez opłaty` };
  }
  if (payment === 'installOnly') {
    return { cost: fitting, label: `${entry.name} — montaż (${fittingLabel})` };
  }
  const price = entryPrice(entry);
  if (price === null) throw new RealtimeError('NO_PRICE');
  return {
    cost: price + fitting,
    label:
      `${entry.name} — ${formatEddies(price)} ed` +
      (fitting > 0 ? ` + montaż ${formatEddies(fitting)} ed (${fittingLabel})` : ''),
  };
}

async function installCyberware(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  character: Character,
  data: CpredCharacterData,
  payload: CharacterCyberwarePayload,
  gesture: RollGesture | undefined,
): Promise<{ messageId: number }> {
  const entry = requireCyberwareEntry(deps, payload.entryId);
  if (data.cyberware.length >= ITEM_ROWS_MAX) throw new RealtimeError('TOO_MANY_ROWS');

  // Money is checked before the dice: a refusal after the roll would mean the
  // table watched somebody lose Humanity to an operation that never happened.
  const bill = installBill(entry, payload.payment, user);
  if (data.eddies < bill.cost) throw new RealtimeError('NOT_ENOUGH_EDDIES');

  const { loss, result, notation } = rollHumanityLoss(entry, gesture?.entropy);
  const row: CpredCyberwareRow = {
    id: nextRowId(),
    name: entry.name,
    notes: '',
    compendiumId: entry.id,
    ...(entry.install ? { install: entry.install } : {}),
    ...cyberwareInstallationFrom(entry),
    humanityLoss: loss,
  };
  // The patch carries both halves at once on purpose: `mergeCharacterData`
  // clamps the pool against the ceiling, and the ceiling has just moved.
  const withRow = mergeCharacterData(data, {
    cyberware: [...data.cyberware, row],
    humanityCurrent: data.humanityCurrent - loss,
  });
  // One write for the chrome and the money — `applyBalance` saves the sheet it
  // is handed, so a paid-for implant cannot end up on nobody's card.
  let updated = withRow;
  if (bill.cost > 0) {
    updated = await applyBalance(
      deps,
      campaignId,
      character,
      withRow,
      { kind: 'cyberware', amount: -bill.cost, label: bill.label },
      user.id,
    );
  } else {
    await saveSheet(deps, campaignId, character, withRow);
  }

  result.title = `Utrata Człowieczeństwa — ${entry.name}`;
  result.actor = character.name;
  // No `breakdown`: it is a list of *modifiers*, and this roll has none — the
  // family belongs in the verdict line, where it reads as a word rather than
  // as „Cybersynapsy +0".
  result.outcome = {
    success: true,
    label: loss > 0 ? `−${loss} Człowieczeństwa` : 'Bez utraty Człowieczeństwa',
    detail:
      (entry.type ? `${CYBERWARE_TYPE_LABELS[entry.type]} · ` : '') +
      (entry.humanityLossHalved === true ? `${notation} / 2 w górę · ` : '') +
      (bill.cost > 0 ? `${formatEddies(bill.cost)} ed · ` : '') +
      humanityLine(updated),
  };
  const messageId = await postCard(deps, campaignId, user, character, result);
  return { messageId };
}

async function removeCyberware(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  character: Character,
  data: CpredCharacterData,
  payload: CharacterCyberwarePayload,
): Promise<{ messageId: number }> {
  const rowId = payload.rowId;
  if (typeof rowId !== 'string' || rowId.length === 0) throw new RealtimeError('BAD_REQUEST');
  const row = data.cyberware.find((entry) => entry.id === rowId);
  if (!row) throw new RealtimeError('ROW_NOT_FOUND');

  // Pulling the hardware raises the ceiling; it does **not** hand back the
  // points it cost. „Człowieczeństwa nie da się całkowicie odzyskać, nie
  // usuwając cyborgizacji" (s. 230) — removal makes the therapy worth paying
  // for, it is not the therapy.
  const updated = mergeCharacterData(data, {
    cyberware: data.cyberware.filter((entry) => entry.id !== rowId),
  });
  await saveSheet(deps, campaignId, character, updated);

  // A card with no dice: removal is surgery, not a roll — but it belongs on the
  // chat next to the install it undoes, and the roll card is the only shape the
  // chat has for „this happened to this character".
  const result: RollResult = {
    notation: '',
    terms: [],
    total: 0,
    criticalDamage: false,
    title: `Usunięcie cyborgizacji — ${row.name}`,
    actor: character.name,
    outcome: {
      success: true,
      label: 'Wszczep usunięty',
      detail: `Sufit Człowieczeństwa wraca · ${humanityLine(updated)}`,
    },
  };
  const messageId = await postCard(deps, campaignId, user, character, result);
  return { messageId };
}

async function runTherapy(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  character: Character,
  data: CpredCharacterData,
  payload: CharacterCyberwarePayload,
  gesture: RollGesture | undefined,
): Promise<{ messageId: number }> {
  if (!isHumanityTherapy(payload.therapy)) throw new RealtimeError('BAD_REQUEST');
  const therapy = HUMANITY_THERAPY_DEFINITIONS[payload.therapy];
  // A week of a Medtech's time has a price (s. 375), and like the operation it
  // is checked before the dice. `none` is the GM waiving it.
  const cost = payload.payment === 'none' ? 0 : therapy.cost;
  if (payload.payment === 'none' && user.role !== ROLE_GM) throw new RealtimeError('FORBIDDEN');
  if (data.eddies < cost) throw new RealtimeError('NOT_ENOUGH_EDDIES');
  const parsed = parseRollNotation(therapy.notation);
  if (!parsed.ok) throw new RealtimeError('BAD_NOTATION');
  const result = rollFormula(parsed.formula, createMixedRng(gesture?.entropy), {
    checkRule: false,
  });

  const before = data.humanityCurrent;
  const healed = mergeCharacterData(data, { humanityCurrent: before + result.total });
  let updated = healed;
  if (cost > 0) {
    updated = await applyBalance(
      deps,
      campaignId,
      character,
      healed,
      { kind: 'therapy', amount: -cost, label: therapy.label },
      user.id,
    );
  } else {
    await saveSheet(deps, campaignId, character, healed);
  }
  const regained = updated.humanityCurrent - before;

  result.title = `Terapia — ${therapy.label}`;
  result.actor = character.name;
  result.outcome = {
    success: true,
    label: `+${regained} Człowieczeństwa`,
    detail:
      (regained < result.total ? 'sufit osiągnięty · ' : '') +
      `PT Technologii medycznej ${therapy.dv} · ` +
      (cost > 0 ? `${formatEddies(cost)} ed · ` : '') +
      humanityLine(updated),
  };
  const messageId = await postCard(deps, campaignId, user, character, result);
  return { messageId };
}
