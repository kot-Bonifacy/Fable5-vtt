/**
 * Tura bota w walce (etap 20b).
 *
 * Rozszerzenie decyzji z 20a o pole bitwy — i, jak tamta, **rdzeń VTT bez ani
 * jednego importu z `systems/cpred`**. Ten plik wie, że bot dostaje listę figur
 * z dystansami, listę broni i budżet tury; nie wie, czym jest PT, seria ani
 * pancerz. Co znaczy „Ciężki pistolet · seria", wie wołający.
 *
 * Cztery rzeczy niosą ten plik.
 *
 * 1. **Stan taktyczny jest policzony, nie do policzenia.** 9B wybiera z gotowych
 *    opcji („Rico — przeciwnik, 12 m") nieporównanie lepiej, niż liczy dystanse
 *    z współrzędnych. Wszystko, co da się policzyć przed pytaniem, jest policzone
 *    przed pytaniem — łącznie z tym, czy do kogoś w ogóle da się strzelić.
 * 2. **Ruch nie ma współrzędnych.** Model wybiera figurę i kierunek („podejście"
 *    / „odwrót"), a trasę liczy serwer A-gwiazdką z 16e i przycina do budżetu
 *    metrów z 14c. Bot, który nie potrafi wskazać punktu, nie potrafi też wyjść
 *    poza RUCH — i to jest bezpiecznik z gramatyki, nie z walidacji.
 * 3. **Dwa rodzaje ruchu zamiast jednego z parametrem.** Opis etapu mówi o akcji
 *    `ruch`; rozbicie jej na „podejście" i „odwrót" oszczędza piąte pole w
 *    schemacie, które — po lekcji z 20a — musiałoby być wymagane przy KAŻDEJ
 *    decyzji, także przy „pas". Mniej pól, wyraźniejsze słowa.
 * 4. **Menu jest gwarancją.** Etykiety figur i broni wchodzą do `enum`, więc
 *    „atak na niewidoczną figurę" jest niemożliwy w gramatyce, a nie wyłapywany
 *    walidacją. Walidacja i tak biegnie drugi raz — z tego samego powodu co
 *    w 20a (gramatyka bywa nieobsługiwana, a odpowiedź podstawiona).
 */

/** Co bot może zrobić w jednym kroku tury. */
export const BOT_COMBAT_ACTIONS = ['attack', 'approach', 'retreat', 'reload', 'pass'] as const;
export type BotCombatActionKind = (typeof BOT_COMBAT_ACTIONS)[number];

/** Słowa, które widzi model. Prompt jest po polsku, więc enum też. */
export const BOT_COMBAT_WORDS: Record<BotCombatActionKind, string> = {
  attack: 'atak',
  approach: 'podejście',
  retreat: 'odwrót',
  reload: 'przeładowanie',
  pass: 'pas',
};

/** Co robi każda akcja, w jednym zdaniu — model widzi to przy enumie. */
export const BOT_COMBAT_ACTION_HINTS: Record<BotCombatActionKind, string> = {
  attack: 'atakujesz figurę z pola „cel" bronią z pola „bron"',
  approach: 'podchodzisz do figury z pola „cel", tak blisko, jak wystarczy ruchu',
  retreat: 'oddalasz się od figury z pola „cel", tak daleko, jak wystarczy ruchu',
  reload: 'ładujesz do pełna magazynek broni z pola „bron"; kosztuje Akcję',
  pass: 'nie robisz nic w tym kroku',
};

/**
 * Ile decyzji składa się na jedną turę (decyzja MG przed kodem).
 *
 * Tura CP RED to Akcja Ruchu **plus** Akcja, więc „podejdź i strzel" to dwa
 * pytania — po pierwszym bot dostaje odświeżony stan (nowe dystanse, wydany
 * budżet) i decyduje drugi raz. Trzeciego kroku nie ma czym zapłacić.
 */
export const BOT_COMBAT_STEPS_MAX = 2;

/** Ile pozycji wchodzi do jednego enuma — powyżej gramatyka rośnie, a 9B gubi się. */
export const BOT_COMBAT_FIGURES_MAX = 12;
export const BOT_COMBAT_WEAPONS_MAX = 12;

/** Przebieg taktyczny jest krótki i chłodny, jak decyzyjny z 20a. */
export const BOT_COMBAT_MAX_TOKENS = 200;
export const BOT_COMBAT_TEMPERATURE = 0.2;

/** Uzasadnienie do karty propozycji i do śladu MG. */
export const BOT_COMBAT_REASON_MAX_LENGTH = 240;

/** Po której stronie stoi figura — jedyna rzecz, po której bot wybiera cel. */
export type BotCombatSide = 'enemy' | 'ally';

export const BOT_COMBAT_SIDE_LABELS: Record<BotCombatSide, string> = {
  enemy: 'przeciwnik',
  ally: 'sojusznik',
};

/** Jedna figura, którą widzi token bota. */
export interface BotCombatFigure {
  /** Nieprzezroczysty identyfikator wołającego (u nas: id tokenu). */
  id: string;
  /** Nazwa wchodząca do `enum` — musi być unikalna w tym menu. */
  label: string;
  side: BotCombatSide;
  /** Odległość w metrach, policzona przez serwer. */
  metres: number;
  /** Naklejki widoczne na figurze; puste jest normą. */
  statuses?: string[];
  /**
   * Dlaczego nie da się do niej teraz strzelić („ściana", „za samochodem").
   * Figura zostaje w menu — jest wciąż celem podejścia i odwrotu.
   */
  noShot?: string;
}

/** Jedna broń w jednym trybie ognia — dokładnie jeden slot paska z 16f. */
export interface BotCombatWeapon {
  /** Identyfikator slotu wołającego (u nas: `weapon:<rowId>:<mode>`). */
  id: string;
  /** Nazwa wchodząca do `enum`; tryb ognia jest jej częścią. */
  label: string;
  /** Jedna linijka kontekstu do promptu; nie wchodzi do enuma. */
  detail?: string;
  /** Broń biała — nie wolno nią strzelać z drugiego końca sali. */
  melee?: boolean;
  /** Naboje w magazynku; brak = broń, która ich nie liczy. */
  ammo?: { current: number; max: number };
  /**
   * Dlaczego nie zadziała teraz („Pusty magazynek — przeładuj"). Broń zostaje
   * w menu: to jest właśnie ta, którą warto przeładować.
   */
  disabled?: string;
}

/** Własna figura bota — wszystko, co o sobie wie, gdy podejmuje decyzję. */
export interface BotCombatSelf {
  name: string;
  /** Punkty Wytrzymałości; null dla figury, której nikt nie policzył. */
  hp: { current: number; max: number } | null;
  /** Stan ran po polsku („lekko ranna"); pusty = bez opisu. */
  wound?: string;
  statuses?: string[];
  /** Metry ruchu zostałe w turze; null = ruch nie jest liczony w metrach. */
  metresLeft: number | null;
  /** Akcja tej tury już poszła. */
  actionSpent: boolean;
  /** Akcja Ruchu tej tury już poszła. */
  moveSpent: boolean;
}

/** Cały stan taktyczny jednej decyzji. */
export interface BotCombatState {
  self: BotCombatSelf;
  figures: BotCombatFigure[];
  weapons: BotCombatWeapon[];
  /** Numer rundy — do promptu, żeby model nie zaczynał walki od nowa. */
  round: number;
  /** Który to krok tury (1-indeksowany), z `BOT_COMBAT_STEPS_MAX`. */
  step: number;
}

/** Decyzja bota po walidacji. */
export type BotCombatDecision =
  | {
      kind: 'attack';
      targetId: string;
      targetLabel: string;
      weaponId: string;
      weaponLabel: string;
      reason: string;
    }
  | { kind: 'approach' | 'retreat'; targetId: string; targetLabel: string; reason: string }
  | { kind: 'reload'; weaponId: string; weaponLabel: string; reason: string }
  | { kind: 'pass'; reason: string };

export type BotCombatParseError =
  /** Model nie oddał parsowalnego JSON-a (gramatyka nieobsługiwana albo pusty strumień). */
  | 'BOT_COMBAT_UNPARSABLE'
  /** Wybrał słowo spoza enuma albo akcję, której w tym kroku nie było na liście. */
  | 'BOT_COMBAT_UNKNOWN_ACTION'
  /** Wskazał figurę spoza menu — albo nie wskazał żadnej. */
  | 'BOT_COMBAT_UNKNOWN_TARGET'
  /** Wskazał broń spoza menu — albo nie wskazał żadnej. */
  | 'BOT_COMBAT_UNKNOWN_WEAPON';

export const BOT_COMBAT_ERROR_LABELS: Record<BotCombatParseError, string> = {
  BOT_COMBAT_UNPARSABLE: 'Model nie oddał decyzji w wymaganym formacie.',
  BOT_COMBAT_UNKNOWN_ACTION: 'Model wybrał akcję, której nie ma na liście.',
  BOT_COMBAT_UNKNOWN_TARGET: 'Model wskazał figurę, której ta postać nie widzi.',
  BOT_COMBAT_UNKNOWN_WEAPON: 'Model wskazał broń, której ta postać nie ma.',
};

export type BotCombatParseResult =
  { ok: true; decision: BotCombatDecision } | { ok: false; error: BotCombatParseError };

/** Etykiety, które faktycznie wchodzą do enumów — po przycięciu menu. */
function figureMenu(state: BotCombatState): BotCombatFigure[] {
  return state.figures.slice(0, BOT_COMBAT_FIGURES_MAX);
}

function weaponMenu(state: BotCombatState): BotCombatWeapon[] {
  return state.weapons.slice(0, BOT_COMBAT_WEAPONS_MAX);
}

/**
 * Akcje wykonalne w tym kroku.
 *
 * Odpowiada na pytanie „czym w ogóle da się dziś zapłacić", a nie „co byłoby
 * mądre": mądre jest zadaniem modelu. Wynik wchodzi do `enum`, więc akcja,
 * której nie ma czym opłacić, jest dla modelu niewymawialna — a bot nie traci
 * kroku tury na propozycję, którą serwer i tak odrzuci.
 *
 * „pas" jest zawsze: krok, w którym nie da się zrobić nic innego, musi mieć
 * czym się skończyć.
 */
export function availableBotCombatActions(state: BotCombatState): BotCombatActionKind[] {
  const figures = figureMenu(state);
  const weapons = weaponMenu(state);
  const actions: BotCombatActionKind[] = [];

  const usableWeapon = weapons.some((weapon) => !weapon.disabled);
  const shootable = figures.some((figure) => !figure.noShot);
  if (!state.self.actionSpent && usableWeapon && shootable) actions.push('attack');

  const canWalk =
    figures.length > 0 && (state.self.metresLeft === null || state.self.metresLeft > 0);
  if (canWalk && !state.self.moveSpent) {
    actions.push('approach');
    actions.push('retreat');
  }

  const reloadable = weapons.some(
    (weapon) => weapon.ammo !== undefined && weapon.ammo.current < weapon.ammo.max,
  );
  if (!state.self.actionSpent && reloadable) actions.push('reload');

  actions.push('pass');
  return actions;
}

/**
 * Schemat, który jedzie do gatewaya.
 *
 * Pola `cel` i `bron` są **wymagane, kiedy tylko istnieją** — także przy „pas",
 * gdzie nic nie znaczą i są ignorowane. To lekcja zmierzona 08.08 w 20a: pole
 * opcjonalne 9B po prostu pomija, więc każdy atak wracałby bez celu. Warunku
 * („wymagane tylko przy ataku") nie da się tu wyrazić — konwerter JSON Schema →
 * GBNF w llama.cpp nie zna `if`/`then`.
 */
export function buildBotCombatSchema(state: BotCombatState): Record<string, unknown> {
  const figures = figureMenu(state).map((figure) => figure.label);
  const weapons = weaponMenu(state).map((weapon) => weapon.label);
  const actions = availableBotCombatActions(state).map((kind) => BOT_COMBAT_WORDS[kind]);
  const required = ['akcja'];
  if (figures.length > 0) required.push('cel');
  if (weapons.length > 0) required.push('bron');
  required.push('powod');
  return {
    type: 'object',
    properties: {
      akcja: { type: 'string', enum: actions },
      ...(figures.length > 0 ? { cel: { type: 'string', enum: figures } } : {}),
      ...(weapons.length > 0 ? { bron: { type: 'string', enum: weapons } } : {}),
      powod: { type: 'string' },
    },
    required,
    additionalProperties: false,
  };
}

function normalizeLabel(raw: string): string {
  return raw.trim().toLocaleLowerCase('pl-PL');
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

/**
 * Czyta odpowiedź modelu. Tolerancyjny mimo gramatyki — z tego samego powodu, co
 * parser z 20a: gramatyka może nie zadziałać, a wtedy dostajemy zwykły tekst
 * z JSON-em w środku. Testy wymuszają odpowiedzi, których prawdziwa gramatyka by
 * nie przepuściła, i to jest cały sens tej funkcji.
 */
export function parseBotCombatAction(raw: string, state: BotCombatState): BotCombatParseResult {
  const json = extractJsonObject(raw);
  if (!json) return { ok: false, error: 'BOT_COMBAT_UNPARSABLE' };

  const word = typeof json.akcja === 'string' ? normalizeLabel(json.akcja) : '';
  const reason =
    typeof json.powod === 'string' ? json.powod.trim().slice(0, BOT_COMBAT_REASON_MAX_LENGTH) : '';
  const allowed = availableBotCombatActions(state);
  const kind = allowed.find((entry) => normalizeLabel(BOT_COMBAT_WORDS[entry]) === word);
  if (!kind) return { ok: false, error: 'BOT_COMBAT_UNKNOWN_ACTION' };

  if (kind === 'pass') return { ok: true, decision: { kind: 'pass', reason } };

  const wantedTarget = typeof json.cel === 'string' ? normalizeLabel(json.cel) : '';
  const target = figureMenu(state).find((figure) => normalizeLabel(figure.label) === wantedTarget);
  const wantedWeapon = typeof json.bron === 'string' ? normalizeLabel(json.bron) : '';
  const weapon = weaponMenu(state).find((entry) => normalizeLabel(entry.label) === wantedWeapon);

  if (kind === 'reload') {
    if (!weapon) return { ok: false, error: 'BOT_COMBAT_UNKNOWN_WEAPON' };
    return {
      ok: true,
      decision: { kind: 'reload', weaponId: weapon.id, weaponLabel: weapon.label, reason },
    };
  }
  if (!target) return { ok: false, error: 'BOT_COMBAT_UNKNOWN_TARGET' };
  if (kind !== 'attack') {
    return {
      ok: true,
      decision: { kind, targetId: target.id, targetLabel: target.label, reason },
    };
  }
  if (!weapon) return { ok: false, error: 'BOT_COMBAT_UNKNOWN_WEAPON' };
  return {
    ok: true,
    decision: {
      kind: 'attack',
      targetId: target.id,
      targetLabel: target.label,
      weaponId: weapon.id,
      weaponLabel: weapon.label,
      reason,
    },
  };
}

/** Jedno zdanie o akcji, wspólne dla karty propozycji, śladu MG i dziennika. */
export function describeBotCombatDecision(decision: BotCombatDecision): string {
  switch (decision.kind) {
    case 'attack':
      return `Atak: ${decision.targetLabel} — ${decision.weaponLabel}`;
    case 'approach':
      return `Podejście do: ${decision.targetLabel}`;
    case 'retreat':
      return `Odwrót od: ${decision.targetLabel}`;
    case 'reload':
      return `Przeładowanie: ${decision.weaponLabel}`;
    case 'pass':
      return 'Pas — nic w tym kroku';
  }
}

/** Metry w formie, którą model czyta bez potykania się o przecinek dziesiętny. */
function metresLabel(metres: number): string {
  const rounded = Math.round(metres * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded} m` : `${rounded.toFixed(1).replace('.', ',')} m`;
}

function statusesLabel(statuses: readonly string[] | undefined): string {
  return statuses && statuses.length > 0 ? statuses.join(', ') : 'brak';
}

/**
 * Stan taktyczny jako tekst.
 *
 * Zwięźle i tabelarycznie, bo to jest cała treść pytania: model nie ma tu nic
 * wymyślać o świecie, tylko wybrać wiersz. Świadomie **nie** ma tu osobowości
 * bota ani jego sekretów — z tego samego powodu, co w 20a: w tym wywołaniu są
 * szumem, kosztowałyby setki tokenów i skłaniały do prozy.
 *
 * Czego tu nie ma i nie będzie: **cudzych PW**. Bot nie czyta kart przeciwników,
 * a wypowiedź, w której NPC wie, że komuś zostały trzy punkty, jest wyciekiem
 * przez usta postaci.
 */
export function buildBotCombatPrompt(
  state: BotCombatState,
  ctx: { botName: string },
): { system: string; user: string } {
  const figures = figureMenu(state);
  const weapons = weaponMenu(state);
  const actions = availableBotCombatActions(state);

  const self = state.self;
  const hp = self.hp ? `PW ${self.hp.current}/${self.hp.max}` : 'PW nieznane';
  const wound = self.wound ? ` (${self.wound})` : '';
  const move =
    self.metresLeft === null
      ? self.moveSpent
        ? 'Ruch: wykorzystany'
        : 'Ruch: dostępny'
      : `Ruch: ${metresLabel(self.metresLeft)} do wykorzystania`;

  const lines = [
    `Jesteś modułem taktycznym postaci ${self.name} w walce (Cyberpunk RED).`,
    `Prowadzi ją bot „${ctx.botName}". Wybierasz JEDNĄ akcję do wykonania teraz.`,
    '',
    `RUNDA ${state.round}, krok ${state.step} z ${BOT_COMBAT_STEPS_MAX}.`,
    `TWOJA FIGURA: ${self.name} · ${hp}${wound} · statusy: ${statusesLabel(self.statuses)}`,
    `BUDŻET TURY: Akcja: ${self.actionSpent ? 'wykorzystana' : 'dostępna'} · ${move}`,
    '',
    'WIDZISZ:',
    ...(figures.length > 0
      ? figures.map((figure) => {
          const parts = [
            BOT_COMBAT_SIDE_LABELS[figure.side],
            metresLabel(figure.metres),
            `statusy: ${statusesLabel(figure.statuses)}`,
          ];
          if (figure.noShot) parts.push(`NIE DA SIĘ STRZELIĆ: ${figure.noShot}`);
          return `- ${figure.label} — ${parts.join(' · ')}`;
        })
      : ['- nikogo (nikt nie jest w twoim polu widzenia)']),
    '',
    'TWOJA BROŃ:',
    ...(weapons.length > 0
      ? weapons.map((weapon) => {
          const parts: string[] = [];
          if (weapon.detail) parts.push(weapon.detail);
          if (weapon.ammo) parts.push(`amunicja ${weapon.ammo.current}/${weapon.ammo.max}`);
          if (weapon.melee) parts.push('broń biała — tylko z bliska');
          if (weapon.disabled) parts.push(`NIEDOSTĘPNA: ${weapon.disabled}`);
          return `- ${weapon.label}${parts.length > 0 ? ` — ${parts.join(' · ')}` : ''}`;
        })
      : ['- nie masz przy sobie broni']),
    '',
    'DOSTĘPNE AKCJE (tylko te wolno wpisać w pole „akcja"):',
    ...actions.map((kind) => `- „${BOT_COMBAT_WORDS[kind]}" — ${BOT_COMBAT_ACTION_HINTS[kind]}`),
    '',
    'Zasady:',
    '- Wypełniasz WSZYSTKIE pola schematu. Przy akcji, która nie potrzebuje celu' +
      ' albo broni, wpisz w to pole cokolwiek z listy — zostanie zignorowane.',
    '- Nie atakujesz sojuszników i nie atakujesz samego siebie.',
    '- Bronią białą atakujesz wyłącznie kogoś, kto stoi tuż obok.',
    // Ta sama lekcja co w 20a: bez przykładu model wpisuje w uzasadnienie
    // arytmetykę zamiast zdania, a to jedyne, co MG czyta na karcie propozycji.
    '- „powod" to jedno krótkie zdanie po polsku do Mistrza Gry, bez liczenia' +
      ' kości i modyfikatorów. Przykład: „Podchodzę, żeby strzelić z bliska."',
  ];

  return {
    system: lines.join('\n'),
    user: 'Odpowiedz wyłącznie obiektem JSON.',
  };
}
