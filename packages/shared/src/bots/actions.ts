/**
 * Decyzje botów jako structured output (etap 20a).
 *
 * Rdzeń VTT, nie system RPG: nic z `systems/cpred` tu nie wchodzi. Bot dostaje
 * **menu gotowych opcji** — par „id, etykieta" — i wybiera jedną. Co znaczy
 * etykieta „Percepcja", wie wołający; ten plik wie tylko, że model ma wybrać
 * jedną z listy i uzasadnić wybór jednym zdaniem.
 *
 * Trzy rzeczy niosą ten plik.
 *
 * 1. **Gramatyka jest gwarancją, nie kontrolą.** Etykiety wchodzą do `enum`
 *    w schemacie, więc llama.cpp próbkuje wyłącznie tokeny, które je składają —
 *    „bot nie może wybrać nieistniejącej umiejętności" nie jest tu regułą
 *    walidacji, tylko własnością gramatyki. `parseBotAction` i tak sprawdza to
 *    drugi raz: gramatyka może być nieobsługiwana, a payload — podstawiony.
 * 2. **Schemat jest płaski i mały.** Trzy pola, żadnych wariantów zagnieżdżonych.
 *    Konwerter JSON Schema → GBNF w llama.cpp bywa kapryśny przy dużych
 *    schematach, a 9B i tak wybiera lepiej z listy niż z drzewa.
 * 3. **Gramatyka nie dotyka polszczyzny.** Ten przebieg jest maszyna-do-maszyny.
 *    Wypowiedź NPC-a jedzie dalej swobodnym tekstem (etapy 10–12) — gramatyka
 *    psuje odmianę i wyklucza streaming zdaniami, na którym stoi TTS.
 */

/**
 * Co model może wybrać. `talk` znaczy „to nie była prośba o mechanikę, odpowiem
 * słowami" — bez tej opcji model naciągałby każdą wypowiedź na rzut, a detektor
 * prośby (`requests.ts`) jest celowo szeroki i musi mieć gdzie się mylić.
 *
 * Etap 20b dołoży tu akcje bojowe (atak, ruch, przeładowanie, pas).
 */
export const BOT_ACTION_DECISIONS = ['check', 'talk'] as const;
export type BotActionDecision = (typeof BOT_ACTION_DECISIONS)[number];

/** Słowa, które widzi model. Cały prompt jest po polsku, więc enum też. */
export const BOT_ACTION_WORDS: Record<BotActionDecision, string> = {
  check: 'rzut',
  talk: 'rozmowa',
};

/** Jedna pozycja menu: co bot może zrobić, opisane tak, jak to zobaczy model. */
export interface BotActionOption {
  /** Nieprzezroczysty identyfikator wołającego (u nas: id umiejętności CP RED). */
  id: string;
  /** Nazwa, która wchodzi do `enum` w schemacie — musi być unikalna w menu. */
  label: string;
  /** Jedna linijka kontekstu w prompcie („poziom 5, ZR 7"); nie jedzie do enuma. */
  detail?: string;
}

/** Uzasadnienie decyzji — jedno zdanie do karty propozycji i do śladu MG. */
export const BOT_ACTION_REASON_MAX_LENGTH = 240;

/** Ile opcji wchodzi do menu. Powyżej tego gramatyka rośnie, a 9B gubi się w liście. */
export const BOT_ACTION_OPTIONS_MAX = 30;

/** Przebieg decyzyjny jest krótki i chłodny — to wybór z listy, nie wypowiedź. */
export const BOT_ACTION_MAX_TOKENS = 160;
export const BOT_ACTION_TEMPERATURE = 0.2;

/** Decyzja bota po walidacji. */
export type BotAction =
  | { kind: 'check'; optionId: string; optionLabel: string; reason: string }
  | { kind: 'talk'; reason: string };

export type BotActionParseError =
  /** Model nie oddał parsowalnego JSON-a (gramatyka nieobsługiwana albo pusty strumień). */
  | 'BOT_ACTION_UNPARSABLE'
  /** Wybrał słowo spoza enuma. */
  | 'BOT_ACTION_UNKNOWN_DECISION'
  /** Chciał rzucać, ale nie wskazał opcji albo wskazał spoza menu. */
  | 'BOT_ACTION_UNKNOWN_OPTION';

export const BOT_ACTION_ERROR_LABELS: Record<BotActionParseError, string> = {
  BOT_ACTION_UNPARSABLE: 'Model nie oddał decyzji w wymaganym formacie.',
  BOT_ACTION_UNKNOWN_DECISION: 'Model wybrał akcję, której nie ma na liście.',
  BOT_ACTION_UNKNOWN_OPTION: 'Model wskazał opcję, której ten bot nie ma.',
};

export type BotActionParseResult =
  { ok: true; action: BotAction } | { ok: false; error: BotActionParseError };

/**
 * Schemat, który jedzie do gatewaya. Etykiety opcji **są** enumem — to jedyne
 * miejsce, w którym „cel musi istnieć" kosztuje zero walidacji.
 *
 * Puste menu (bot bez karty postaci) zabiera z enuma samo słowo „rzut": model
 * nie ma wtedy jak wybrać czegoś, czego nie da się wykonać.
 *
 * **Pole umiejętności jest wymagane zawsze, gdy menu istnieje** — także przy
 * decyzji „rozmowa", przy której nic nie znaczy i jest ignorowane. Zmierzone
 * 08.08 na żywym modelu: pole opcjonalne 9B po prostu pomija, więc KAŻDY rzut
 * wracał jako „model nie wskazał umiejętności". Warunku („wymagane tylko przy
 * rzucie") nie da się tu wyrazić: konwerter JSON Schema → GBNF w llama.cpp nie
 * obsługuje `if`/`then`, a rozbicie na `oneOf` dwóch obiektów jest dokładnie tym
 * zagnieżdżonym wariantem, którego etap kazał unikać.
 */
export function buildBotActionSchema(options: BotActionOption[]): Record<string, unknown> {
  const labels = options.slice(0, BOT_ACTION_OPTIONS_MAX).map((option) => option.label);
  const hasOptions = labels.length > 0;
  const decisions = hasOptions
    ? [BOT_ACTION_WORDS.check, BOT_ACTION_WORDS.talk]
    : [BOT_ACTION_WORDS.talk];
  return {
    type: 'object',
    properties: {
      akcja: { type: 'string', enum: decisions },
      ...(hasOptions ? { umiejetnosc: { type: 'string', enum: labels } } : {}),
      powod: { type: 'string' },
    },
    required: hasOptions ? ['akcja', 'umiejetnosc', 'powod'] : ['akcja', 'powod'],
    additionalProperties: false,
  };
}

function normalizeLabel(raw: string): string {
  return raw.trim().toLocaleLowerCase('pl-PL');
}

/**
 * Czyta odpowiedź modelu. Tolerancyjny mimo gramatyki — z tego samego powodu, co
 * parser propozycji relacji w 19c: gramatyka może nie zadziałać (stary
 * llama-server, inny backend), a wtedy dostajemy zwykły tekst z JSON-em w środku.
 */
export function parseBotAction(raw: string, options: BotActionOption[]): BotActionParseResult {
  const json = extractJsonObject(raw);
  if (!json) return { ok: false, error: 'BOT_ACTION_UNPARSABLE' };

  const decisionWord = typeof json.akcja === 'string' ? normalizeLabel(json.akcja) : '';
  const reason =
    typeof json.powod === 'string' ? json.powod.trim().slice(0, BOT_ACTION_REASON_MAX_LENGTH) : '';

  if (decisionWord === normalizeLabel(BOT_ACTION_WORDS.talk)) {
    return { ok: true, action: { kind: 'talk', reason } };
  }
  if (decisionWord !== normalizeLabel(BOT_ACTION_WORDS.check)) {
    return { ok: false, error: 'BOT_ACTION_UNKNOWN_DECISION' };
  }

  const wanted = typeof json.umiejetnosc === 'string' ? normalizeLabel(json.umiejetnosc) : '';
  if (wanted.length === 0) return { ok: false, error: 'BOT_ACTION_UNKNOWN_OPTION' };
  const allowed = options.slice(0, BOT_ACTION_OPTIONS_MAX);
  const match = allowed.find((option) => normalizeLabel(option.label) === wanted);
  if (!match) return { ok: false, error: 'BOT_ACTION_UNKNOWN_OPTION' };
  return {
    ok: true,
    action: { kind: 'check', optionId: match.id, optionLabel: match.label, reason },
  };
}

/** Pierwszy obiekt JSON w tekście — gramatyka oddaje sam obiekt, reszta to ratunek. */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (text.length === 0) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export interface BotDecisionPromptContext {
  /** Kogo pytamy — imię wchodzi do promptu, żeby model nie pisał za kogoś innego. */
  botName: string;
  /** Karta postaci, którą bot dysponuje; null = nie ma czym rzucać. */
  characterName: string | null;
  options: BotActionOption[];
  /** Wypowiedź, na którą bot ma zareagować. */
  request: string;
  /** Kto o to poprosił — model inaczej czyta prośbę MG, a inaczej zaczepkę gracza. */
  speaker: string;
}

/**
 * Prompt przebiegu decyzyjnego. Świadomie **nie** jest to prompt postaci: tu nie
 * gramy roli, tylko wybieramy z listy. Osobowość, sekrety i odzywki są w tym
 * wywołaniu szumem — kosztowałyby setki tokenów i skłaniały model do prozy,
 * której gramatyka i tak nie przepuści.
 */
export function buildBotDecisionPrompt(ctx: BotDecisionPromptContext): {
  system: string;
  user: string;
} {
  const menu = ctx.options
    .slice(0, BOT_ACTION_OPTIONS_MAX)
    .map((option) => `- ${option.label}${option.detail ? ` (${option.detail})` : ''}`)
    .join('\n');

  const system = [
    `Jesteś modułem decyzyjnym postaci ${ctx.botName} w sesji RPG.`,
    'Twoim jedynym zadaniem jest rozstrzygnąć, czy ostatnia wypowiedź prosi tę postać' +
      ' o wykonanie testu (rzutu kośćmi), czy tylko o odpowiedź słowami.',
    '',
    'Zasady:',
    `- „${BOT_ACTION_WORDS.check}" wybierasz TYLKO wtedy, gdy ktoś wprost prosi o test, rzut albo sprawdzenie` +
      ' umiejętności — i tylko wtedy, gdy odpowiednia umiejętność jest na liście poniżej.',
    `- „${BOT_ACTION_WORDS.talk}" wybierasz w każdym innym przypadku, także wtedy, gdy prośba dotyczy` +
      ' kogoś innego, umiejętności spoza listy albo jest zwykłą rozmową.',
    '- Pole „powod" to jedno krótkie zdanie po polsku, skierowane do Mistrza Gry.' +
      ' Nie wcielasz się w postać i nie piszesz jej kwestii.',
    // Zmierzone 08.08 na żywej kampanii: bez przykładu 9B wpisuje w to pole
    // arytmetykę („Percepcja (0) + INT (5) = 5") zamiast zdania — a to jedyna
    // rzecz, którą MG czyta na karcie propozycji, żeby ją ocenić.
    '- W „powod" NIE liczysz kości ani modyfikatorów. Piszesz, po co ten test.' +
      ' Przykład: „MG prosi o nasłuchanie, czy ktoś stoi za drzwiami."',
    '',
    ctx.characterName
      ? `Karta postaci: ${ctx.characterName}. Umiejętności, którymi ta postać może rzucać:\n${menu}`
      : 'Ta postać nie ma karty postaci, więc nie może wykonać żadnego testu —' +
        ` zawsze wybierasz „${BOT_ACTION_WORDS.talk}".`,
  ].join('\n');

  const user = [
    `Wypowiedź (${ctx.speaker}): ${ctx.request.trim()}`,
    '',
    'Odpowiedz wyłącznie obiektem JSON.',
  ].join('\n');

  return { system, user };
}
