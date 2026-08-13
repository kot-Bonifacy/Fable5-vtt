/**
 * Screamsheety — zajawka przygody w gazetowym przebraniu (etap 24c).
 *
 * Rdzeń VTT, nie system RPG: „wycinek z brukowca" to rodzaj handoutu z 24a,
 * a nie byt z własną listą odbiorców. Cała droga „zapisz → udostępnij →
 * wyskocz graczowi" jest ta sama, co przy notatce od fixera; tutaj dochodzi
 * generator treści i szablon graficzny.
 *
 * Trzy rzeczy niesie ten plik.
 *
 * 1. **Rodzaj jest polem handoutu, nie drugą tabelą.** `kind` rozstrzyga, czy
 *    kartka renderuje się jak notatka, czy jak pierwsza strona gazety —
 *    udostępnianie, kosz i okno pływające nie wiedzą o tym rozróżnieniu nic.
 * 2. **Nagłówkiem jest tytuł handoutu.** Nie ma osobnego pola „headline", bo
 *    wtedy lista handoutów, linia na czacie i belka okna musiałyby wybierać,
 *    które z dwóch pól pokazać. Screamsheet dokłada do tytułu trzy rzeczy:
 *    lead, nazwę brukowca i datę w stopce.
 * 3. **Treść zostaje markdownem.** Model pisze tekst, a nie HTML — `markdown.ts`
 *    zwraca drzewo bloków, więc znacznik wpisany (albo wymyślony) w treści jest
 *    tekstem na ekranie gracza. To jedyna bariera, jakiej ta droga potrzebuje.
 */

/** Rodzaje handoutu. `note` to kartka z 24a, `screamsheet` — wycinek z gazety. */
export const HANDOUT_KINDS = ['note', 'screamsheet'] as const;
export type HandoutKind = (typeof HANDOUT_KINDS)[number];

export function parseHandoutKind(raw: unknown): HandoutKind {
  return raw === 'screamsheet' ? 'screamsheet' : 'note';
}

/** Lead to jeden akapit wprowadzenia, nie druga treść. */
export const SCREAMSHEET_LEAD_MAX_LENGTH = 400;
export const SCREAMSHEET_OUTLET_MAX_LENGTH = 60;
export const SCREAMSHEET_DATELINE_MAX_LENGTH = 60;
/** Hasło od MG: „strzelanina w Kabuki", a nie gotowy artykuł. */
export const SCREAMSHEET_TOPIC_MAX_LENGTH = 300;

/**
 * Domyślna winieta i data. Obie są zwykłymi polami tekstowymi — kalendarz
 * kampanii zna MG, nie VTT, więc nic się tu nie wylicza z zegara. 2045 to rok,
 * w którym stoi domyślne Night City.
 */
export const DEFAULT_SCREAMSHEET_OUTLET = 'WIADOMOŚCI NIGHT CITY';
export const DEFAULT_SCREAMSHEET_DATELINE = 'Night City, wrzesień 2045';

/** Gazetowe „meble" wokół tytułu i treści handoutu. */
export interface ScreamsheetMeta {
  /** Wytłuszczony akapit pod nagłówkiem. */
  lead: string;
  /** Winieta u góry — nazwa brukowca albo kanału. */
  outlet: string;
  /** Stopka: miejsce i data w świecie gry. */
  dateline: string;
}

function clamp(raw: unknown, limit: number, fallback = ''): string {
  const text = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (text.length === 0) return fallback;
  return text.slice(0, limit);
}

/**
 * Meble screamsheetu w postaci nadającej się do zapisu. Puste pole wraca
 * wypełnione wartością domyślną — gazeta bez winiety i bez daty przestaje
 * wyglądać jak gazeta, a MG i tak może wpisać własne.
 */
export function normalizeScreamsheetMeta(raw: unknown): ScreamsheetMeta {
  const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    lead: clamp(input.lead, SCREAMSHEET_LEAD_MAX_LENGTH),
    outlet: clamp(input.outlet, SCREAMSHEET_OUTLET_MAX_LENGTH, DEFAULT_SCREAMSHEET_OUTLET),
    dateline: clamp(input.dateline, SCREAMSHEET_DATELINE_MAX_LENGTH, DEFAULT_SCREAMSHEET_DATELINE),
  };
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/** Klient → serwer: hasło MG plus winieta, która ma nadać ton. */
export interface ScreamsheetGeneratePayload {
  topic: string;
  outlet?: string;
}

/** To, co model napisał — trzy pola formularza, jeszcze nie handout. */
export interface ScreamsheetDraft {
  headline: string;
  lead: string;
  body: string;
}

export interface ScreamsheetDraftBroadcast {
  requestId: string;
  draft: ScreamsheetDraft;
  totalMs: number;
}

export interface ScreamsheetErrorBroadcast {
  requestId: string;
  code: string;
  detail?: string;
}

/** Nagłówek, lead i kilka akapitów mieszczą się w tym budżecie z zapasem. */
export const SCREAMSHEET_MAX_TOKENS = 800;

/**
 * Wyżej niż u kronikarza (0,2) i u NPC-a: brukowiec ma zmyślać, bo cała jego
 * treść jest zmyślona z definicji. To jedyne miejsce w projekcie, gdzie
 * kreatywność modelu jest produktem, a nie ryzykiem.
 */
export const SCREAMSHEET_TEMPERATURE = 0.9;

/**
 * Prompt brukowca. Etykiety pól są po polsku i wielkimi literami, bo model 9B
 * trzyma się takiego formatu znacznie lepiej niż JSON-a — a parser i tak
 * wybacza ich brak (patrz `parseScreamsheetDraft`).
 */
export function buildScreamsheetPrompt(options: {
  topic: string;
  outlet: string;
  campaignName?: string | null;
}): { system: string; user: string } {
  const where = options.campaignName ? ` w kampanii „${options.campaignName}"` : '';
  return {
    system: [
      `Jesteś dziennikarzem brukowca „${options.outlet}" w Night City — mieście z gry` +
        ` Cyberpunk RED${where}. Piszesz krótkie, sensacyjne notki prasowe.`,
      '',
      '# Format odpowiedzi',
      'NAGŁÓWEK: krzykliwy tytuł, do 70 znaków, bez kropki na końcu',
      'LEAD: jedno–dwa zdania streszczające całą sprawę',
      'TREŚĆ:',
      'dwa do czterech krótkich akapitów artykułu',
      '',
      '# Zasady',
      '1. Piszesz po polsku, żywym językiem ulicznej prasy — krótkie zdania, mocne słowa.',
      '2. Trzymasz się klimatu Cyberpunka: korporacje, gangi, cyberware, MedTech, NCPD,' +
        ' dzielnice Night City. Nie odwołujesz się do naszego świata ani do jego polityki.',
      '3. Zmyślasz szczegóły — nazwiska świadków, nazwy lokali, godziny — bo to gazeta,' +
        ' a nie protokół. Ale nie zmyślasz zasad gry ani statystyk.',
      '4. Zostawiasz jedną rzecz niedopowiedzianą: brukowiec ma zaczepić czytelnika,' +
        ' a nie zamknąć sprawę.',
      '5. Nie komentujesz zadania, nie tłumaczysz się i nie dopisujesz nic po artykule.',
    ].join('\n'),
    user: [`Temat od redakcji: ${options.topic}`, '', 'Napisz notkę do jutrzejszego wydania.'].join(
      '\n',
    ),
  };
}

const LABELS = {
  headline: /^(?:\*{0,2}|#{1,6}\s*)(?:nag[łl][oó]wek|headline|tytu[łl])\s*:?\**\s*(.*)$/i,
  lead: /^(?:\*{0,2}|#{1,6}\s*)(?:lead|lid|wst[eę]p)\s*:?\**\s*(.*)$/i,
  body: /^(?:\*{0,2}|#{1,6}\s*)(?:tre[śs][ćc]|body|artyku[łl])\s*:?\**\s*(.*)$/i,
} as const;

/** Zdejmuje ozdobniki, którymi model lubi obudować tytuł. */
function stripDecorations(line: string): string {
  return line
    .replace(/^[#>\s]+/, '')
    .replace(/^\*+|\*+$/g, '')
    .replace(/^[„"']|["'"]$/g, '')
    .trim();
}

/**
 * Surowa odpowiedź modelu jako trzy pola formularza.
 *
 * Parser jest wyrozumiały z rozmysłem: model, który zapomni etykiet, i tak ma
 * dać MG coś do poprawienia. Bez żadnej etykiety pierwsza linia jest
 * nagłówkiem, druga leadem, reszta treścią — dokładnie w tej kolejności, w
 * jakiej prosi o nie prompt.
 */
export function parseScreamsheetDraft(raw: string): ScreamsheetDraft {
  const lines = raw.replace(/\r/g, '').split('\n');
  let headline = '';
  let lead = '';
  const body: string[] = [];
  let section: 'none' | 'lead' | 'body' = 'none';
  const rest: string[] = [];

  for (const line of lines) {
    const headlineMatch = LABELS.headline.exec(line.trim());
    if (headlineMatch && headline.length === 0) {
      headline = stripDecorations(headlineMatch[1] ?? '');
      section = 'none';
      continue;
    }
    const leadMatch = LABELS.lead.exec(line.trim());
    if (leadMatch && lead.length === 0) {
      lead = stripDecorations(leadMatch[1] ?? '');
      section = 'lead';
      continue;
    }
    const bodyMatch = LABELS.body.exec(line.trim());
    if (bodyMatch) {
      const tail = stripDecorations(bodyMatch[1] ?? '');
      if (tail.length > 0) body.push(tail);
      section = 'body';
      continue;
    }

    if (section === 'body') body.push(line);
    else if (section === 'lead' && line.trim().length > 0 && lead.length === 0) {
      lead = stripDecorations(line);
    } else if (section === 'lead' && line.trim().length > 0) body.push(line);
    else if (section === 'lead') section = 'body';
    else rest.push(line);
  }

  // Model bez etykiet: pierwsza niepusta linia to tytuł, druga lead, reszta treść.
  if (headline.length === 0 && lead.length === 0 && body.length === 0) {
    const meaningful = rest.map((line) => line.trim()).filter((line) => line.length > 0);
    headline = stripDecorations(meaningful[0] ?? '');
    lead = stripDecorations(meaningful[1] ?? '');
    body.push(...meaningful.slice(2));
  } else if (body.length === 0 && rest.some((line) => line.trim().length > 0)) {
    body.push(...rest);
  }

  return {
    headline: headline.slice(0, 120),
    lead: lead.slice(0, SCREAMSHEET_LEAD_MAX_LENGTH),
    body: body.join('\n').trim(),
  };
}

/** Polski komunikat odmowy generatora — jeden słownik dla całego klienta. */
export function screamsheetErrorText(code: string, detail?: string): string {
  switch (code) {
    case 'AI_UNAVAILABLE':
      return 'Generator jest niedostępny — AI Gateway nie odpowiada. Wypełnij szablon ręcznie.';
    case 'AI_ERROR':
      return detail
        ? `Model nie napisał artykułu (${detail}).`
        : 'Model nie napisał artykułu. Spróbuj jeszcze raz albo wypełnij szablon ręcznie.';
    case 'EMPTY_TOPIC':
      return 'Podaj hasło, o czym ma być artykuł.';
    case 'NO_CAMPAIGN':
      return 'Brak aktywnej kampanii.';
    case 'FORBIDDEN':
      return 'Screamsheety pisze Mistrz Gry.';
    default:
      return 'Nie udało się napisać screamsheetu.';
  }
}
