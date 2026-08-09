import type {
  BotActPayload,
  BotAction,
  BotActionOption,
  BotActionProposal,
  BotActionTraceBroadcast,
  BotProposalResolvePayload,
  ChatMessageView,
  CpredCharacterData,
  SessionUser,
} from '@vtt/shared';
import {
  BOT_ACTION_ERROR_LABELS,
  BOT_ACTION_MAX_TOKENS,
  BOT_ACTION_OPTIONS_MAX,
  BOT_ACTION_TEMPERATURE,
  ROLE_GM,
  buildBotActionSchema,
  buildBotDecisionPrompt,
  effectiveCpredStats,
  mentionsName,
  parseBotAction,
  parseBotData,
  parseCharacterData,
  type BotActionParseError,
  type BotProfileData,
} from '@vtt/shared';
import type { AiChatRequest } from '../ai/gateway.js';
import type { Character } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { resolveBotCombatProposal } from './bot-combat.js';
import { botActorUser, logBotDecision } from './bot-runtime.js';
import { requireCampaignBot } from './bots.js';
import { performCharacterRoll } from './character-rolls.js';
import { INCLUDE_CHAT_NAMES, insertChatMessage, deliverChatMessageTo } from './chat-io.js';
import { toChatMessageView } from './chat-io.js';
import { gmRoom } from './state.js';

/**
 * Akcje botów w mechanice (etap 20a).
 *
 * Bot przestaje tylko mówić i zaczyna działać — na razie poza walką, jednym
 * rzutem z własnej karty postaci. Cztery rzeczy trzymają ten plik.
 *
 * 1. **Przebieg decyzyjny jest osobnym wywołaniem.** Gramatyka JSON nie dotyka
 *    wypowiedzi NPC-a: ta jedzie dalej swobodnym tekstem ze wszystkim, co
 *    zbudowały etapy 10–11 (kotwica roli, wykrywanie wyjścia z roli). Tutaj
 *    jest wybór z listy, a nie proza — i dlatego prompt też jest inny: bez
 *    osobowości, sekretów i odzywek, które w tym pytaniu są samym szumem.
 * 2. **Menu jest prawdą, nie podpowiedzią.** Etykiety umiejętności wchodzą do
 *    `enum` w schemacie, więc „umiejętność, której bot nie ma" jest niemożliwa
 *    już na poziomie gramatyki. Walidacja i tak biegnie drugi raz — gramatyka
 *    bywa nieobsługiwana, a odpowiedź podstawiona (patrz testy).
 * 3. **Bot działa z uprawnieniami konta MG** — tak jak jego wypowiedzi od etapu
 *    11, gdzie autorem linii NPC-a jest konto MG. A skoro MG jest zwolniony
 *    z blokad (`realtime/movement.ts`), **bezpieczniki muszą stać przed
 *    wywołaniem**: bot rzuca wyłącznie kartą, która jest do niego przypisana.
 * 4. **Gracze nie widzą, że rzucił bot.** Karta rzutu jest zwyczajna; karta
 *    propozycji jedzie wyłącznie do MG i sterującego gracza, a ślad decyzji —
 *    tylko do pokoju MG, jak `bot:trace` z 19b.
 */

/** Co zrobił przebieg decyzyjny — wołający decyduje, czy jeszcze mówić. */
export type BotActionOutcome =
  /** Rzut wykonany (tryb automat). */
  | 'executed'
  /** Karta propozycji czeka na klik. */
  | 'proposed'
  /** To nie była prośba o mechanikę — niech bot odpowie słowami. */
  | 'talk';

interface BotActionRequest {
  campaignId: string;
  botId: string;
  sceneId: string | null;
  /** Wypowiedź, na którą bot ma zareagować. */
  request: string;
  /** Kto ją wypowiedział — model inaczej czyta prośbę MG, a inaczej zaczepkę. */
  speaker: string;
  /** Konto, na które zapisujemy rzut i kartę propozycji (konto MG). */
  authorId: string;
  signal?: AbortSignal;
}

/**
 * Menu umiejętności, którymi ta karta może rzucać.
 *
 * Dwie rzeczy naraz: **wytrenowane** (poziom ≥ 1, od najmocniejszych) oraz
 * **wymienione w prośbie** — żeby „rzuć na Percepcję" zadziałało także wtedy,
 * gdy postać ma tę umiejętność na zerze. RAW pozwala rzucać nietrenowaną
 * umiejętnością (sama CECHA), a odmowa „nie mam jej na liście" byłaby regułą,
 * której podręcznik nie zna.
 */
export function botSkillOptions(
  deps: RealtimeDeps,
  data: CpredCharacterData,
  request: string,
): BotActionOption[] {
  const registry = deps.ctx.cpred;
  const byId = new Map(registry.skills.map((skill) => [skill.id, skill]));
  const options: BotActionOption[] = [];
  const seen = new Set<string>();

  const push = (id: string): void => {
    const skill = byId.get(id);
    if (!skill || seen.has(skill.id)) return;
    // Etykieta jest kluczem w enumie, więc duplikat nazwy byłby niejednoznaczny.
    if (options.some((option) => option.label === skill.name)) return;
    seen.add(skill.id);
    const level = data.skills[skill.id] ?? 0;
    // EMP bieżące, nie z karty (etap 23a) — menu ma pokazywać to, czym bot
    // naprawdę rzuci, a nie wartość sprzed cyborgizacji.
    const stat = effectiveCpredStats(data.stats, data.humanityCurrent)[skill.stat] ?? 0;
    options.push({
      id: skill.id,
      label: skill.name,
      detail: `poziom ${level}, ${skill.stat.toUpperCase()} ${stat}`,
    });
  };

  // Nazwane wprost idą pierwsze: jeśli menu trzeba przyciąć, to nie o to, o co
  // MG właśnie poprosił.
  for (const skill of registry.skills) {
    if (mentionsName(request, skill.name)) push(skill.id);
  }
  const trained = Object.entries(data.skills)
    .filter(([, level]) => level > 0)
    .sort((a, b) => b[1] - a[1]);
  for (const [id] of trained) push(id);
  return options.slice(0, BOT_ACTION_OPTIONS_MAX);
}

/** Karta postaci bota — jedyna, którą wolno mu rzucać. */
async function botCharacter(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string | null,
): Promise<Character | null> {
  if (!characterId) return null;
  const character = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.campaignId !== campaignId) return null;
  return character;
}

interface DecisionRun {
  action: BotAction | null;
  error: BotActionParseError | null;
  /** Kod błędu gatewaya (AI_UNAVAILABLE, AI_UNREACHABLE…). */
  failure: string | null;
  raw: string;
  retried: boolean;
  tookMs: number;
}

/**
 * Jedno pytanie do modelu, z jedną szansą poprawki.
 *
 * Poprawka nie zmienia promptu o nic poza dopisanym powodem odrzucenia — model
 * ma dostać dokładnie tę informację, której mu zabrakło, a nie inny problem.
 */
async function runDecision(
  deps: RealtimeDeps,
  bot: { id: string; name: string; data: BotProfileData },
  options: BotActionOption[],
  ctx: { characterName: string | null; request: string; speaker: string; signal?: AbortSignal },
): Promise<DecisionRun> {
  const started = Date.now();
  const prompt = buildBotDecisionPrompt({
    botName: bot.name,
    characterName: ctx.characterName,
    options,
    request: ctx.request,
    speaker: ctx.speaker,
  });
  const schema = buildBotActionSchema(options);

  const ask = async (extra: string): Promise<{ raw: string; failure: string | null }> => {
    const request: AiChatRequest = {
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: extra ? `${prompt.user}\n\n${extra}` : prompt.user },
      ],
      purpose: 'npc',
      botId: bot.id,
      // Gateway i tak wymusza tu brak rozumowania (gramatyka + think = ryzyko
      // pustej odpowiedzi); mówimy to wprost, żeby czytać intencję z kodu.
      reasoning: false,
      maxTokens: BOT_ACTION_MAX_TOKENS,
      temperature: BOT_ACTION_TEMPERATURE,
      jsonSchema: schema,
    };
    let raw = '';
    for await (const event of deps.ctx.ai.streamChat(request, ctx.signal)) {
      if (event.type === 'delta') raw += event.text;
      if (event.type === 'error') return { raw, failure: event.code };
    }
    return { raw, failure: null };
  };

  const first = await ask('');
  if (first.failure) {
    return {
      action: null,
      error: null,
      failure: first.failure,
      raw: first.raw,
      retried: false,
      tookMs: Date.now() - started,
    };
  }
  const parsedFirst = parseBotAction(first.raw, options);
  if (parsedFirst.ok) {
    return {
      action: parsedFirst.action,
      error: null,
      failure: null,
      raw: first.raw,
      retried: false,
      tookMs: Date.now() - started,
    };
  }

  const second = await ask(
    `Poprzednia odpowiedź została odrzucona: ${BOT_ACTION_ERROR_LABELS[parsedFirst.error]}` +
      ' Odpowiedz jeszcze raz, wyłącznie obiektem JSON zgodnym ze schematem.',
  );
  if (second.failure) {
    return {
      action: null,
      error: parsedFirst.error,
      failure: second.failure,
      raw: `${first.raw}\n---\n${second.raw}`,
      retried: true,
      tookMs: Date.now() - started,
    };
  }
  const parsedSecond = parseBotAction(second.raw, options);
  return {
    action: parsedSecond.ok ? parsedSecond.action : null,
    error: parsedSecond.ok ? null : parsedSecond.error,
    failure: null,
    raw: `${first.raw}\n---\n${second.raw}`,
    retried: true,
    tookMs: Date.now() - started,
  };
}

function trace(deps: RealtimeDeps, campaignId: string, payload: BotActionTraceBroadcast): void {
  deps.io.to(gmRoom(campaignId)).emit('bot:action-trace', payload);
}

/**
 * Cały przebieg: zapytaj model, zwaliduj, wykonaj albo zaproponuj.
 *
 * Zwraca `talk`, gdy bot ma po prostu odpowiedzieć słowami — wołający (kolejka
 * z etapu 11) idzie wtedy dalej swoją zwykłą ścieżką.
 */
export async function runBotAction(
  deps: RealtimeDeps,
  request: BotActionRequest,
): Promise<BotActionOutcome> {
  const stored = await deps.ctx.prisma.botProfile.findUnique({ where: { id: request.botId } });
  if (!stored || stored.campaignId !== request.campaignId) return 'talk';
  const data = parseBotData(stored.data);
  // Asystent MG nie gra żadną postacią, a bot kontrolowany ma tylko mówić.
  if (data.type === 'gm_assistant' || data.autonomy === 'controlled') return 'talk';

  const character = await botCharacter(deps, request.campaignId, stored.characterId);
  const sheet = character ? parseCharacterData(character.data, deps.ctx.cpred) : null;
  const options = sheet ? botSkillOptions(deps, sheet, request.request) : [];

  const run = await runDecision(deps, { id: stored.id, name: stored.name, data }, options, {
    characterName: character?.name ?? null,
    request: request.request,
    speaker: request.speaker,
    signal: request.signal,
  });

  void logBotDecision(deps, {
    kind: 'check',
    campaignId: request.campaignId,
    botId: stored.id,
    botName: stored.name,
    autonomy: data.autonomy,
    request: request.request,
    speaker: request.speaker,
    options: options.map((option) => option.label),
    raw: run.raw,
    error: run.error,
    failure: run.failure,
    retried: run.retried,
    tookMs: run.tookMs,
  });

  const base = {
    botId: stored.id,
    botName: stored.name,
    autonomy: data.autonomy,
    decisionMs: run.tookMs,
    retried: run.retried,
  };

  if (run.failure) {
    // Degradacja: gateway leży, więc bot niczego nie robi — ale czat żyje dalej
    // i wołający pozna to po tym, że rzut nie przyszedł.
    trace(deps, request.campaignId, {
      ...base,
      decision: null,
      outcome: 'refused',
      refusal: 'Brak połączenia z AI Gateway.',
    });
    return 'talk';
  }
  if (!run.action) {
    trace(deps, request.campaignId, {
      ...base,
      decision: null,
      outcome: 'refused',
      refusal: run.error ? BOT_ACTION_ERROR_LABELS[run.error] : 'Model nie oddał decyzji.',
    });
    return 'talk';
  }
  if (run.action.kind === 'talk') {
    trace(deps, request.campaignId, {
      ...base,
      decision: 'talk',
      outcome: 'talk',
      ...(run.action.reason ? { reason: run.action.reason } : {}),
    });
    return 'talk';
  }

  // Bezpiecznik, który nie jest gramatyką: model wybrał umiejętność z menu, ale
  // menu zbudowaliśmy z KARTY BOTA. Nie ma karty — nie ma rzutu, i to nie jest
  // przypadek do naprawiania promptem.
  if (!character || !sheet) {
    trace(deps, request.campaignId, {
      ...base,
      decision: 'check',
      outcome: 'refused',
      optionLabel: run.action.optionLabel,
      refusal: 'Ten bot nie ma przypisanej karty postaci.',
    });
    return 'talk';
  }

  const action = run.action;
  if (data.autonomy === 'auto') {
    try {
      await performCharacterRoll(deps, {
        campaignId: request.campaignId,
        user: await botActorUser(deps, request.authorId),
        sceneId: request.sceneId,
        payload: {
          characterId: character.id,
          request: { kind: 'skill', skillId: action.optionId },
          visibility: 'public',
        },
      });
    } catch (error) {
      const code = error instanceof RealtimeError ? error.code : 'INTERNAL';
      deps.log.warn({ err: error, botId: stored.id }, 'bot roll refused');
      trace(deps, request.campaignId, {
        ...base,
        decision: 'check',
        outcome: 'refused',
        optionLabel: action.optionLabel,
        refusal: `Serwer odmówił rzutu (${code}).`,
      });
      return 'talk';
    }
    trace(deps, request.campaignId, {
      ...base,
      decision: 'check',
      outcome: 'executed',
      optionLabel: action.optionLabel,
      ...(action.reason ? { reason: action.reason } : {}),
    });
    return 'executed';
  }

  await postProposal(deps, request, {
    botId: stored.id,
    botName: stored.name,
    characterId: character.id,
    characterName: character.name,
    optionId: action.optionId,
    optionLabel: action.optionLabel,
    reason: action.reason,
    request: request.request,
    controllerUserId: data.controllerUserId,
  });
  trace(deps, request.campaignId, {
    ...base,
    decision: 'check',
    outcome: 'proposed',
    optionLabel: action.optionLabel,
    ...(action.reason ? { reason: action.reason } : {}),
  });
  return 'proposed';
}

/** Karta propozycji na czacie — widzi ją MG i sterujący gracz, nikt więcej. */
async function postProposal(
  deps: RealtimeDeps,
  request: BotActionRequest,
  proposal: BotActionProposal,
): Promise<ChatMessageView> {
  const message = await insertChatMessage(deps.ctx.prisma, {
    campaignId: request.campaignId,
    authorId: request.authorId,
    kind: 'proposal',
    text: `${proposal.botName} chce rzucić: ${proposal.optionLabel}`,
    payload: JSON.stringify(proposal),
    sceneId: request.sceneId,
    // Sterujący gracz musi zobaczyć kartę także po odświeżeniu strony, a historia
    // czatu filtruje po `recipientId` — stąd adresat, mimo że to nie szept.
    ...(proposal.controllerUserId ? { recipientId: proposal.controllerUserId } : {}),
  });
  await deliverChatMessageTo(deps, request.campaignId, message, [proposal.controllerUserId], true);
  return message;
}

/** Czy ten użytkownik może odpowiedzieć na tę kartę. */
function mayResolve(user: SessionUser, proposal: BotActionProposal): boolean {
  return user.role === ROLE_GM || proposal.controllerUserId === user.id;
}

/**
 * „Zatwierdź" / „Odrzuć". Stan zapisuje się w wiadomości, nie w pamięci — karta
 * ma przeżyć restart serwera z sensownym wyglądem, a nie z martwymi przyciskami.
 */
export const botProposalResolveEvent = defineEvent<
  BotProposalResolvePayload,
  { rollMessageId: number | null }
>({
  name: 'bot:proposal',
  handler: async ({ deps, socket, user, payload }) => {
    if (!socket.data.campaign) throw new RealtimeError('NO_CAMPAIGN');
    const campaignId = socket.data.campaign.id;
    const messageId = payload?.messageId;
    if (typeof messageId !== 'number' || !Number.isInteger(messageId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const message = await deps.ctx.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: INCLUDE_CHAT_NAMES,
    });
    if (!message || message.campaignId !== campaignId || message.kind !== 'proposal') {
      throw new RealtimeError('MESSAGE_NOT_FOUND');
    }
    if (!message.payload) throw new RealtimeError('MESSAGE_NOT_FOUND');
    const proposal = JSON.parse(message.payload) as BotActionProposal;
    if (!mayResolve(user, proposal)) throw new RealtimeError('FORBIDDEN');
    if (proposal.resolution) throw new RealtimeError('PROPOSAL_ALREADY_RESOLVED');

    let rollMessageId: number | null = null;
    let refusal: string | undefined;
    if (payload?.approve === true) {
      // Karta trzyma id postaci sprzed kliknięcia, ale prawo do działania
      // odczytujemy z bota TERAZ: MG mógł w międzyczasie odpiąć mu kartę.
      const bot = await deps.ctx.prisma.botProfile.findUnique({ where: { id: proposal.botId } });
      if (!bot || bot.campaignId !== campaignId || bot.characterId !== proposal.characterId) {
        throw new RealtimeError('BOT_CHARACTER_CHANGED');
      }
      if (proposal.combat) {
        // Akcja bojowa (20b) idzie inną ścieżką niż rzut z karty — i jest
        // odtwarzana na świeżym stanie taktycznym, bo między propozycją
        // a kliknięciem mogła minąć runda.
        const played = await resolveBotCombatProposal(deps, {
          campaignId,
          proposal: proposal.combat,
        });
        if (played.outcome === 'refused') refusal = played.refusal ?? 'Akcja nie doszła do skutku.';
      } else {
        const rolled = await performCharacterRoll(deps, {
          campaignId,
          user: await botActorUser(deps, message.authorId),
          sceneId: message.sceneId ?? null,
          payload: {
            characterId: proposal.characterId ?? '',
            request: { kind: 'skill', skillId: proposal.optionId },
            visibility: 'public',
          },
        });
        rollMessageId = rolled.messageId;
      }
    }

    const resolved: BotActionProposal = {
      ...proposal,
      resolution: payload?.approve === true ? 'approved' : 'rejected',
      resolvedByName: user.name,
      ...(rollMessageId !== null ? { rollMessageId } : {}),
      // Zatwierdzona akcja, która i tak się nie odbyła, musi zostawić ślad na
      // karcie: inaczej MG widzi „ZATWIERDZONE" i nic więcej się nie dzieje.
      ...(refusal ? { blocked: refusal } : {}),
    };
    const saved = await deps.ctx.prisma.chatMessage.update({
      where: { id: message.id },
      data: { payload: JSON.stringify(resolved) },
      include: INCLUDE_CHAT_NAMES,
    });
    await deliverChatMessageTo(
      deps,
      campaignId,
      toChatMessageView(saved),
      [proposal.controllerUserId],
      true,
      'chat:update',
    );
    return { rollMessageId };
  },
});

/**
 * „Poproś o akcję" — ścieżka pewna, z pominięciem detektora z `requests.ts`.
 * MG wpisuje, czego chce, i bot decyduje; detektor jest wygodą, nie bramą.
 */
export const botActEvent = defineEvent<BotActPayload, { outcome: BotActionOutcome }>({
  name: 'bot:act',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    if (!socket.data.campaign) throw new RealtimeError('NO_CAMPAIGN');
    const campaignId = socket.data.campaign.id;
    const bot = await requireCampaignBot(deps.ctx.prisma, campaignId, payload?.botId);
    const request = typeof payload?.request === 'string' ? payload.request.trim() : '';
    if (request.length === 0) throw new RealtimeError('BOT_EMPTY_MESSAGE');
    if (!deps.ctx.ai.getStatus().available) throw new RealtimeError('AI_UNAVAILABLE');

    const outcome = await runBotAction(deps, {
      campaignId,
      botId: bot.id,
      sceneId: socket.data.viewedSceneId ?? null,
      request,
      speaker: user.name,
      authorId: user.id,
    });
    return { outcome };
  },
});
