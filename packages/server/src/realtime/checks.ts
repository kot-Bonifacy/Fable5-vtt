import type {
  CheckCallEntry,
  CheckCallPayload,
  CheckCallVisibility,
  CheckCancelPayload,
  CheckRequestCancelPayload,
  CheckRequestEntry,
  CheckRequestPayload,
  CheckRequestResolvePayload,
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
  CHECK_REQUEST_OPEN_MAX,
  CPRED_SITUATIONAL_MODIFIER_LIMIT,
  ROLE_GM,
  checkCallTargetText,
  cpredDifficultyRungAt,
  isCheckCallOpen,
  isCheckRequestOpen,
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
 * Wezwanie do Testu (etap 32) i prośba o Test (etap 40) — jedna sprawa widziana
 * z dwóch stron stołu.
 *
 * Trzy rzeczy, które ten moduł trzyma i których nie oddaje klientowi:
 *
 *  - **co pada** — Umiejętność albo Cecha, zapisana w wezwaniu przy jego
 *    wystawianiu; gracz przy kubku nie podaje żądania, tylko id wezwania,
 *  - **przeciw czemu** — PT albo liczba drugiej strony; klient, który mógłby
 *    nazwać własny próg, ustalałby trudność wymyślonego przez MG wydarzenia,
 *  - **kto zobaczy wynik** — wybrany przez MG przy wystawianiu, nie przy rzucie.
 *
 * Prośba gracza (etap 40) trzyma tę samą umowę **z drugiej strony**: gracz nie
 * nazywa progu ani widoczności, a przy zgodzie serwer bierze Umiejętność
 * z zapisanej prośby, nie z żądania MG.
 *
 * Samo wezwanie jedzie wzorem szeptu (MG + wezwany), bo jest prośbą do jednej
 * osoby; dopiero karta rzutu idzie tam, gdzie każe `visibility`. Skutki
 * wydarzenia rozlicza MG ręką — VTT dowozi werdykt, nie konsekwencje (decyzja
 * MG z 02.09.2026, potwierdzona 06.09 przy etapie 40).
 */

/** Rodzaje rzutu, o które MG może poprosić. Reszta ma własne zdarzenia. */
const CALLABLE_KINDS = ['skill', 'stat'] as const;

function requireInteger(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RealtimeError('BAD_REQUEST');
  }
  return value;
}

/**
 * Rama, którą MG obudowuje Test: próg, modyfikator i widoczność.
 *
 * Wspólna dla obu dróg — `check:call` i zgody na prośbę z etapu 40 — bo to
 * dokładnie ten sam zestaw decyzji MG i ta sama walidacja. Rozdzielenie jej na
 * dwie kopie rozjechałoby widełki przy pierwszej zmianie drabinki.
 */
interface CheckFrame {
  dv?: number;
  opponentBonus?: number;
  modifier: number;
  visibility: CheckCallVisibility;
}

function parseCheckFrame(payload: {
  dv?: unknown;
  opponentBonus?: unknown;
  modifier?: unknown;
  visibility?: unknown;
}): CheckFrame {
  const modifier =
    payload.modifier === undefined
      ? 0
      : requireInteger(
          payload.modifier,
          -CPRED_SITUATIONAL_MODIFIER_LIMIT,
          CPRED_SITUATIONAL_MODIFIER_LIMIT,
        );
  // Próg albo przeciwnik — nigdy oba. „PT 15 i jeszcze rzut drugiej strony"
  // nie jest testem, o którym mówi s. 130, tylko dwoma testami naraz.
  const hasDv = payload.dv !== undefined;
  const hasOpponent = payload.opponentBonus !== undefined;
  if (hasDv === hasOpponent) throw new RealtimeError('BAD_REQUEST');
  return {
    ...(hasDv ? { dv: requireInteger(payload.dv, CHECK_CALL_DV_MIN, CHECK_CALL_DV_MAX) } : {}),
    ...(hasOpponent
      ? {
          opponentBonus: requireInteger(
            payload.opponentBonus,
            CHECK_CALL_OPPONENT_MIN,
            CHECK_CALL_OPPONENT_MAX,
          ),
        }
      : {}),
    modifier,
    visibility: payload.visibility === 'gm' ? 'gm' : 'public',
  };
}

/** Żądanie przycięte do tego, co Test może nieść — reszta nie ma tu czego szukać. */
function requireCallableRequest(raw: unknown, modifier: number): CpredRollRequest {
  const request = raw as CpredRollRequest | undefined;
  const kind = request?.kind;
  if (!CALLABLE_KINDS.includes(kind as (typeof CALLABLE_KINDS)[number])) {
    throw new RealtimeError('BAD_REQUEST');
  }
  // Szczęście deklaruje rzucający przy kubku, a wszystko poza Umiejętnością,
  // Cechą i modyfikatorem MG jest tu nadmiarowe.
  return {
    kind: request!.kind,
    ...(request!.skillId ? { skillId: request!.skillId } : {}),
    ...(request!.statId ? { statId: request!.statId } : {}),
    modifier,
  };
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

/**
 * Wystawia wezwanie do Testu i dostarcza jego kartę — **jedyne** miejsce
 * w kodzie, w którym wezwanie powstaje.
 *
 * Wydzielone z handlera `check:call` przy etapie 40, bo zgoda na prośbę gracza
 * kończy się dokładnie tym samym wezwaniem. Druga kopia tej logiki rozjechałaby
 * się z oryginałem w pierwszym etapie, który dołoży wezwaniu cokolwiek nowego —
 * tak samo, jak rzut na wezwanie świadomie jedzie istniejącym `character:roll`,
 * zamiast mieć własne zdarzenie.
 */
export async function createCheckCall(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    /** Kto wystawia — na karcie jako „wezwał". Zawsze MG. */
    user: SessionUser;
    characterId: string;
    /** Umiejętność albo Cecha; modyfikator i tak wchodzi z ramy. */
    request: unknown;
    frame: CheckFrame;
    prompt?: string;
  },
): Promise<{ messageId: number; entry: CheckCallEntry }> {
  const { campaignId, user, frame } = input;
  const registry = deps.ctx.cpred;

  if (typeof input.characterId !== 'string' || input.characterId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: input.characterId },
  });
  if (!character || character.campaignId !== campaignId) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }

  const request = requireCallableRequest(input.request, frame.modifier);
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (prompt.length > CHECK_CALL_PROMPT_MAX) throw new RealtimeError('BAD_REQUEST');

  // Ten sam planer, który rzuci — po to, żeby nieznana Umiejętność padła
  // TERAZ, u MG przy wystawianiu, a nie graczowi w ręce przy kubku.
  const data = parseCharacterData(character.data, registry);
  const planned = planCpredRoll(data, registry, request);
  if (!planned.ok) throw new RealtimeError(planned.error);

  const rung = frame.dv === undefined ? null : cpredDifficultyRungAt(frame.dv);
  const entry: CheckCallEntry = {
    characterId: character.id,
    characterName: character.name,
    ownerId: character.ownerId,
    rollLabel: planned.plan.title,
    ...(prompt.length > 0 ? { prompt } : {}),
    ...(frame.dv !== undefined ? { dv: frame.dv } : {}),
    ...(rung ? { dvLabel: rung.label } : {}),
    ...(frame.opponentBonus !== undefined ? { opponentBonus: frame.opponentBonus } : {}),
    ...(frame.modifier !== 0 ? { modifier: frame.modifier } : {}),
    visibility: frame.visibility,
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
  return { messageId: message.id, entry };
}

export const checkCallEvent = defineEvent<
  CheckCallPayload<CpredRollRequest>,
  { messageId: number }
>({
  name: 'check:call',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const frame = parseCheckFrame(payload ?? {});

    // „Ustaw…" na karcie prośby (etap 40): MG dochodzi tu z pełnego okna
    // wezwania, w którym mógł podmienić Umiejętność. Prośbę zamyka **to samo
    // żądanie**, żeby zgoda i wezwanie nie mogły się rozejść na dwie połowy.
    const requestMessageId = payload?.requestMessageId;
    const pendingRequest =
      requestMessageId === undefined
        ? null
        : await requireOpenCheckRequest(deps.ctx.prisma, campaignId, requestMessageId);

    const created = await createCheckCall(deps, {
      campaignId,
      user,
      characterId: payload!.characterId,
      request: payload!.request,
      frame,
      ...(payload?.prompt !== undefined ? { prompt: payload.prompt } : {}),
    });

    if (pendingRequest) {
      pendingRequest.entry.resolution = {
        kind: 'approved',
        byName: user.name,
        callMessageId: created.messageId,
        targetText: checkCallTargetText(created.entry),
      };
      await emitCheckRequestUpdate(deps, campaignId, requestMessageId!, pendingRequest.entry);
    }

    return { messageId: created.messageId };
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

/* ------------------------------------------------------------------ *
 * Prośba gracza o Test (etap 40)
 * ------------------------------------------------------------------ */

/** Reads a stored `request` message, its entry and its author, or refuses. */
async function requireCheckRequest(
  prisma: PrismaClient,
  campaignId: string,
  messageId: unknown,
): Promise<{ authorId: string; entry: CheckRequestEntry }> {
  if (typeof messageId !== 'number' || !Number.isInteger(messageId)) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const stored = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!stored || stored.campaignId !== campaignId || stored.kind !== 'request' || !stored.payload) {
    throw new RealtimeError('REQUEST_NOT_FOUND');
  }
  return { authorId: stored.authorId, entry: JSON.parse(stored.payload) as CheckRequestEntry };
}

/** To samo, plus warunek „nikt jeszcze nie odpowiedział" — zgoda ma paść raz. */
async function requireOpenCheckRequest(
  prisma: PrismaClient,
  campaignId: string,
  messageId: unknown,
): Promise<{ authorId: string; entry: CheckRequestEntry }> {
  const found = await requireCheckRequest(prisma, campaignId, messageId);
  if (!isCheckRequestOpen(found.entry)) throw new RealtimeError('REQUEST_CLOSED');
  return found;
}

/**
 * Re-delivers a request card after it changed — `chat:update`, never a second
 * message, exactly as the call card travels since stage 32.
 */
async function emitCheckRequestUpdate(
  deps: RealtimeDeps,
  campaignId: string,
  messageId: number,
  entry: CheckRequestEntry,
): Promise<void> {
  const stored = await deps.ctx.prisma.chatMessage.update({
    where: { id: messageId },
    data: { payload: JSON.stringify(entry) },
    include: INCLUDE_CHAT_NAMES,
  });
  await deliverChatMessageTo(
    deps,
    campaignId,
    toChatMessageView(stored),
    [entry.askedById],
    true,
    'chat:update',
  );
}

/** Ile próśb tego gracza czeka jeszcze na odpowiedź MG. */
async function countOpenRequests(
  prisma: PrismaClient,
  campaignId: string,
  authorId: string,
): Promise<number> {
  // Liczone z feedu, nie z drugiego magazynu stanu — dokładnie tak, jak kubek
  // szuka otwartego wezwania. Skala tej aplikacji to jedna sesja i kilku
  // graczy (CLAUDE.md), więc przelot po zapisanych prośbach jest tańszy niż
  // kolumna, którą trzeba by utrzymywać w zgodzie z payloadem.
  const rows = await prisma.chatMessage.findMany({
    where: { campaignId, kind: 'request', authorId },
    select: { payload: true },
  });
  let open = 0;
  for (const row of rows) {
    if (!row.payload) continue;
    if (isCheckRequestOpen(JSON.parse(row.payload) as CheckRequestEntry)) open += 1;
  }
  return open;
}

export const checkRequestEvent = defineEvent<
  CheckRequestPayload<CpredRollRequest>,
  { messageId: number }
>({
  name: 'check:request',
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
    // Właściciel czytany z bazy, nigdy z payloadu: prosi się **swoją** kartą.
    // MG nie prosi samego siebie — ma wezwanie z etapu 32 (decyzja MG nr 1
    // z 06.09.2026), i dlatego nie ma tu furtki „albo MG".
    if (character.ownerId !== user.id) throw new RealtimeError('CHARACTER_NOT_YOURS');

    // Modyfikator 0: sytuacyjny należy do MG i dochodzi dopiero przy zgodzie.
    const request = requireCallableRequest(payload?.request, 0);
    const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';
    if (reason.length > CHECK_CALL_PROMPT_MAX) throw new RealtimeError('BAD_REQUEST');

    if ((await countOpenRequests(deps.ctx.prisma, campaignId, user.id)) >= CHECK_REQUEST_OPEN_MAX) {
      throw new RealtimeError('REQUEST_LIMIT');
    }

    // Ten sam planer, który rzuci — nieznana Umiejętność ma paść tutaj,
    // u proszącego, a nie MG w ręce przy klikaniu szczebla.
    const data = parseCharacterData(character.data, registry);
    const planned = planCpredRoll(data, registry, request);
    if (!planned.ok) throw new RealtimeError(planned.error);

    const entry: CheckRequestEntry = {
      characterId: character.id,
      characterName: character.name,
      askedById: user.id,
      askedByName: user.name,
      rollLabel: planned.plan.title,
      ...(reason.length > 0 ? { reason } : {}),
      system: request as unknown as Record<string, unknown>,
    };

    const message = await insertChatMessage(deps.ctx.prisma, {
      campaignId,
      authorId: user.id,
      kind: 'request',
      text: reason.length > 0 ? reason : planned.plan.title,
      payload: JSON.stringify(entry),
    });
    // Wzorem szeptu: MG i proszący. Stół zobaczy dopiero wynik, a o jego
    // widoczności zdecyduje MG przy zgodzie.
    await deliverChatMessageTo(deps, campaignId, message, [user.id], true);
    return { messageId: message.id };
  },
});

export const checkRequestCancelEvent = defineEvent<CheckRequestCancelPayload, void>({
  name: 'check:request-cancel',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { authorId, entry } = await requireOpenCheckRequest(
      deps.ctx.prisma,
      campaignId,
      payload?.messageId,
    );
    // Autor z bazy, nie `askedById` z payloadu — ta sama umowa, którą trzyma
    // `bot:proposal`: pole karty służy do rysowania, nie do wpuszczania.
    if (authorId !== user.id) throw new RealtimeError('REQUEST_NOT_YOURS');
    entry.resolution = { kind: 'withdrawn', byName: user.name };
    await emitCheckRequestUpdate(deps, campaignId, payload!.messageId, entry);
  },
});

export const checkRequestResolveEvent = defineEvent<
  CheckRequestResolvePayload,
  { callMessageId?: number }
>({
  name: 'check:request-resolve',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const messageId = payload?.messageId;
    const { entry } = await requireOpenCheckRequest(deps.ctx.prisma, campaignId, messageId);

    if (payload?.approve !== true) {
      const note = typeof payload?.note === 'string' ? payload.note.trim() : '';
      if (note.length > CHECK_CALL_PROMPT_MAX) throw new RealtimeError('BAD_REQUEST');
      entry.resolution = {
        kind: 'refused',
        byName: user.name,
        ...(note.length > 0 ? { note } : {}),
      };
      await emitCheckRequestUpdate(deps, campaignId, messageId as number, entry);
      return {};
    }

    const frame = parseCheckFrame(payload);
    let created: { messageId: number; entry: CheckCallEntry };
    try {
      created = await createCheckCall(deps, {
        campaignId,
        user,
        characterId: entry.characterId,
        // Umiejętność z **zapisanej prośby**, nie z żądania MG: między prośbą
        // a kliknięciem mogła minąć scena, ale rzucić ma to, o co gracz prosił.
        request: entry.system,
        frame,
        ...(entry.reason !== undefined ? { prompt: entry.reason } : {}),
      });
    } catch (error) {
      // Karta mogła w międzyczasie zniknąć albo zmienić właściciela. Zgoda
      // wraca wtedy odmową i **zostawia na karcie ślad** — cicha bezczynność
      // wyglądałaby u gracza jak zgubione kliknięcie.
      if (error instanceof RealtimeError && error.code === 'CHARACTER_NOT_FOUND') {
        entry.resolution = {
          kind: 'refused',
          byName: user.name,
          note: 'Karty postaci już nie ma — poproś ponownie.',
        };
        await emitCheckRequestUpdate(deps, campaignId, messageId as number, entry);
      }
      throw error;
    }

    entry.resolution = {
      kind: 'approved',
      byName: user.name,
      callMessageId: created.messageId,
      targetText: checkCallTargetText(created.entry),
    };
    await emitCheckRequestUpdate(deps, campaignId, messageId as number, entry);
    return { callMessageId: created.messageId };
  },
});
