import type {
  CheckCallEntry,
  CheckCallPayload,
  CheckCallVisibility,
  CheckCancelPayload,
  ChatMessageView,
  CpredRollRequest,
  SessionUser,
} from '@vtt/shared';
import {
  CHECK_CALL_DV_MAX,
  CHECK_CALL_DV_MIN,
  CHECK_CALL_OPPONENT_MAX,
  CHECK_CALL_OPPONENT_MIN,
  CHECK_CALL_PROMPT_MAX,
  CPRED_SITUATIONAL_MODIFIER_LIMIT,
  ROLE_GM,
  cpredDifficultyRungAt,
  isCheckCallOpen,
  mayAnswerCheckCall,
  parseCharacterData,
  planCpredRoll,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireCampaignId } from './combat.js';
import {
  INCLUDE_CHAT_NAMES,
  deliverChatMessageTo,
  insertChatMessage,
  toChatMessageView,
} from './chat-io.js';

/**
 * Wezwanie do Testu (etap 32) — MG prosi jedną postać o rzut na nietypowe
 * wydarzenie, a karta czatu czeka z przyciskiem „Rzuć".
 *
 * Trzy rzeczy, które ten moduł trzyma i których nie oddaje klientowi:
 *
 *  - **co pada** — Umiejętność albo Cecha, zapisana w wezwaniu przy jego
 *    wystawianiu; gracz przy kubku nie podaje żądania, tylko id wezwania,
 *  - **przeciw czemu** — PT albo liczba drugiej strony; klient, który mógłby
 *    nazwać własny próg, ustalałby trudność wymyślonego przez MG wydarzenia,
 *  - **kto zobaczy wynik** — wybrany przez MG przy wystawianiu, nie przy rzucie.
 *
 * Samo wezwanie jedzie wzorem szeptu (MG + wezwany), bo jest prośbą do jednej
 * osoby; dopiero karta rzutu idzie tam, gdzie każe `visibility`. Skutki
 * wydarzenia rozlicza MG ręką — VTT dowozi werdykt, nie konsekwencje (decyzja
 * MG z 02.09.2026).
 */

/** Rodzaje rzutu, o które MG może poprosić. Reszta ma własne zdarzenia. */
const CALLABLE_KINDS = ['skill', 'stat'] as const;

function requireInteger(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RealtimeError('BAD_REQUEST');
  }
  return value;
}

/** Reads a stored `check` message and its entry, or refuses. */
export async function requireCheckCall(
  prisma: PrismaClient,
  campaignId: string,
  messageId: unknown,
): Promise<{ message: ChatMessageView; entry: CheckCallEntry }> {
  if (typeof messageId !== 'number' || !Number.isInteger(messageId)) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const stored = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: INCLUDE_CHAT_NAMES,
  });
  if (!stored || stored.campaignId !== campaignId || stored.kind !== 'check' || !stored.payload) {
    throw new RealtimeError('CALL_NOT_FOUND');
  }
  return {
    message: toChatMessageView(stored),
    entry: JSON.parse(stored.payload) as CheckCallEntry,
  };
}

/**
 * Re-delivers a call card after it changed (rolled, or withdrawn).
 *
 * `chat:update` rather than a second `chat:message`, exactly as an undone
 * damage entry travels since stage 15: the card the player is looking at is the
 * one that has to change its mind.
 */
export async function emitCheckCallUpdate(
  deps: RealtimeDeps,
  campaignId: string,
  messageId: number,
  entry: CheckCallEntry,
): Promise<void> {
  const stored = await deps.ctx.prisma.chatMessage.update({
    where: { id: messageId },
    data: { payload: JSON.stringify(entry) },
    include: INCLUDE_CHAT_NAMES,
  });
  const view = toChatMessageView(stored);
  await deliverChatMessageTo(deps, campaignId, view, [entry.ownerId], true, 'chat:update');
}

export const checkCallEvent = defineEvent<
  CheckCallPayload<CpredRollRequest>,
  { messageId: number }
>({
  name: 'check:call',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const registry = deps.ctx.cpred;

    const characterId = payload?.characterId;
    if (typeof characterId !== 'string' || characterId.length === 0) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const character = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
    if (!character || character.campaignId !== campaignId) {
      throw new RealtimeError('CHARACTER_NOT_FOUND');
    }

    const kind = payload?.request?.kind;
    if (!CALLABLE_KINDS.includes(kind as (typeof CALLABLE_KINDS)[number])) {
      throw new RealtimeError('BAD_REQUEST');
    }

    const modifier =
      payload?.modifier === undefined
        ? 0
        : requireInteger(
            payload.modifier,
            -CPRED_SITUATIONAL_MODIFIER_LIMIT,
            CPRED_SITUATIONAL_MODIFIER_LIMIT,
          );
    // Próg albo przeciwnik — nigdy oba. „PT 15 i jeszcze rzut drugiej strony"
    // nie jest testem, o którym mówi s. 130, tylko dwoma testami naraz.
    const hasDv = payload?.dv !== undefined;
    const hasOpponent = payload?.opponentBonus !== undefined;
    if (hasDv === hasOpponent) throw new RealtimeError('BAD_REQUEST');
    const dv = hasDv
      ? requireInteger(payload!.dv, CHECK_CALL_DV_MIN, CHECK_CALL_DV_MAX)
      : undefined;
    const opponentBonus = hasOpponent
      ? requireInteger(payload!.opponentBonus, CHECK_CALL_OPPONENT_MIN, CHECK_CALL_OPPONENT_MAX)
      : undefined;

    const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : '';
    if (prompt.length > CHECK_CALL_PROMPT_MAX) throw new RealtimeError('BAD_REQUEST');
    const visibility: CheckCallVisibility = payload?.visibility === 'gm' ? 'gm' : 'public';

    // Żądanie przycięte do tego, co wezwanie może nieść: Szczęście deklaruje
    // rzucający przy kubku, a wszystko poza Umiejętnością, Cechą
    // i modyfikatorem MG nie ma tu czego szukać.
    const request: CpredRollRequest = {
      kind: payload!.request.kind,
      ...(payload!.request.skillId ? { skillId: payload!.request.skillId } : {}),
      ...(payload!.request.statId ? { statId: payload!.request.statId } : {}),
      modifier,
    };

    // Ten sam planer, który rzuci — po to, żeby nieznana Umiejętność padła
    // TERAZ, u MG przy wystawianiu, a nie graczowi w ręce przy kubku.
    const data = parseCharacterData(character.data, registry);
    const planned = planCpredRoll(data, registry, request);
    if (!planned.ok) throw new RealtimeError(planned.error);

    const rung = dv === undefined ? null : cpredDifficultyRungAt(dv);
    const entry: CheckCallEntry = {
      characterId: character.id,
      characterName: character.name,
      ownerId: character.ownerId,
      rollLabel: planned.plan.title,
      ...(prompt.length > 0 ? { prompt } : {}),
      ...(dv !== undefined ? { dv } : {}),
      ...(rung ? { dvLabel: rung.label } : {}),
      ...(opponentBonus !== undefined ? { opponentBonus } : {}),
      ...(modifier !== 0 ? { modifier } : {}),
      visibility,
      system: request as unknown as Record<string, unknown>,
      calledByName: user.name,
    };

    const message = await insertChatMessage(deps.ctx.prisma, {
      campaignId,
      authorId: user.id,
      kind: 'check',
      text: prompt.length > 0 ? prompt : planned.plan.title,
      // Adres wezwania — dzięki niemu gracz odnajduje kartę w historii po
      // przeładowaniu (`visibleTo` przepuszcza wiadomości z `recipientId`).
      recipientId: character.ownerId,
      payload: JSON.stringify(entry),
    });
    await deliverChatMessageTo(deps, campaignId, message, [character.ownerId], true);
    return { messageId: message.id };
  },
});

export const checkCancelEvent = defineEvent<CheckCancelPayload, void>({
  name: 'check:cancel',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { entry } = await requireCheckCall(deps.ctx.prisma, campaignId, payload?.messageId);
    // Rzuconego wezwania nie da się cofnąć: kości padły i stół je widział.
    if (!isCheckCallOpen(entry)) throw new RealtimeError('CALL_CLOSED');
    entry.cancelled = { byName: user.name };
    await emitCheckCallUpdate(deps, campaignId, payload!.messageId, entry);
  },
});

/**
 * Wezwanie, na które ten użytkownik ma prawo odpowiedzieć rzutem.
 *
 * Wołane z `character:roll`, gdy żądanie niesie `callMessageId` — i to jedyne
 * miejsce, w którym wezwanie zamienia się w rzut.
 */
export async function resolveAnsweredCall(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  messageId: unknown,
): Promise<{ messageId: number; entry: CheckCallEntry }> {
  const { entry } = await requireCheckCall(deps.ctx.prisma, campaignId, messageId);
  if (!isCheckCallOpen(entry)) throw new RealtimeError('CALL_CLOSED');
  if (!mayAnswerCheckCall(entry, user.id, user.role === ROLE_GM)) {
    throw new RealtimeError('CALL_NOT_YOURS');
  }
  return { messageId: messageId as number, entry };
}
