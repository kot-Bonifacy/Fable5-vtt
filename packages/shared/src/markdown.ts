/**
 * Podzbiór markdowna dla materiałów MG (etap 24a).
 *
 * Rdzeń VTT, nie system RPG — o Cyberpunku nie wie tu nic.
 *
 * **Dlaczego własny parser, a nie biblioteka.** Wynikiem jest **drzewo bloków**,
 * nie HTML. Klient renderuje je na elementy React, więc w całej drodze
 * „treść MG → ekran gracza" nie ma ani jednego `dangerouslySetInnerHTML` ani
 * sanitizera, którego trzeba pilnować. Ma to znaczenie dopiero w etapie 24c,
 * gdzie treść pisze **model językowy** — a wtedy „wstrzyknięty HTML" przestaje
 * być teoretyczny.
 *
 * Podzbiór jest świadomie mały: nagłówki, pogrubienie, kursywa, kod, listy,
 * cytat, linia pozioma i odnośniki. Nie ma tabel, obrazków w treści (handout
 * ma osobne pole na grafikę) ani zagnieżdżonych list — handout to jedna
 * kartka do ręki, nie rozdział podręcznika.
 */

export type MarkdownInline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: MarkdownInline[] }
  | { type: 'em'; children: MarkdownInline[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: MarkdownInline[] }
  /** Pojedyncze złamanie wiersza wewnątrz akapitu. */
  | { type: 'break' };

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; children: MarkdownInline[] }
  | { type: 'paragraph'; children: MarkdownInline[] }
  | { type: 'list'; ordered: boolean; items: MarkdownInline[][] }
  | { type: 'quote'; children: MarkdownInline[] }
  | { type: 'code'; value: string }
  | { type: 'rule' };

/**
 * Schematy, które wolno wpisać w `[tekst](adres)`. Wszystko poza tą listą —
 * `javascript:`, `data:`, `vbscript:` — przestaje być odnośnikiem i renderuje
 * się jako zwykły tekst. Adres względny (`/uploads/…`) przechodzi, bo handout
 * może wskazywać wgraną grafikę.
 */
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

export function isSafeMarkdownHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  const scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.exec(trimmed);
  if (!scheme) return false;
  return SAFE_SCHEMES.includes(scheme[0].toLowerCase());
}

/** Znaki, które wolno „unieszkodliwić" ukośnikiem wstecznym. */
const ESCAPABLE = '\\`*_[]()#>-!';

function pushText(nodes: MarkdownInline[], value: string): void {
  if (value.length === 0) return;
  const last = nodes.at(-1);
  if (last?.type === 'text') last.value += value;
  else nodes.push({ type: 'text', value });
}

/** Czy `_` w tej pozycji jest znacznikiem, czy zwykłym znakiem w `snake_case`. */
function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}

/**
 * Szuka zamknięcia znacznika `marker` od pozycji `from`. Zwraca indeks
 * otwierającego znaku zamknięcia albo −1. Ucieczki (`\*`) pomija.
 */
function findClosing(text: string, marker: string, from: number, underscore: boolean): number {
  const char = marker[0]!;
  for (let index = from; index <= text.length - marker.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
      continue;
    }
    if (!text.startsWith(marker, index)) continue;
    // Zamknięcie nie może wisieć w środku wyrazu (`kot_i_pies`) ani po spacji
    // („* nie kursywa"), bo wtedy gwiazdka jest po prostu gwiazdką.
    if (text[index - 1] === ' ') continue;

    // Ciąg dłuższy niż znacznik domyka się OD KOŃCA: w `**mocno *bardziej***`
    // dwie ostatnie gwiazdki należą do pogrubienia, a pierwsza zostaje w środku
    // dla kursywy. Bez tego wewnętrzny znacznik zostaje bez pary.
    let run = index;
    while (text[run] === char) run += 1;
    const closing = run - marker.length;

    if (underscore && isWordChar(text[closing + marker.length])) continue;
    return closing;
  }
  return -1;
}

/**
 * Rozkłada jeden wiersz (albo akapit) na węzły liniowe.
 *
 * Kolejność ma znaczenie: kod dosłowny jest sprawdzany pierwszy, bo w
 * `` `**nie pogrubione**` `` gwiazdki są treścią, nie znacznikiem.
 */
export function parseMarkdownInline(input: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index]!;

    if (char === '\\' && index + 1 < input.length && ESCAPABLE.includes(input[index + 1]!)) {
      pushText(nodes, input[index + 1]!);
      index += 2;
      continue;
    }

    if (char === '\n') {
      nodes.push({ type: 'break' });
      index += 1;
      continue;
    }

    if (char === '`') {
      const end = input.indexOf('`', index + 1);
      if (end > index + 1) {
        nodes.push({ type: 'code', value: input.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    if (char === '[') {
      const link = matchLink(input, index);
      if (link) {
        nodes.push(link.node);
        index = link.next;
        continue;
      }
    }

    const emphasis = matchEmphasis(input, index);
    if (emphasis) {
      nodes.push(emphasis.node);
      index = emphasis.next;
      continue;
    }

    pushText(nodes, char);
    index += 1;
  }

  return nodes;
}

/** Znaczniki nacisku, od najdłuższego — inaczej `**` przeczytałoby się jako dwa `*`. */
const EMPHASIS = [
  ['**', 'strong'],
  ['__', 'strong'],
  ['*', 'em'],
  ['_', 'em'],
] as const;

function matchEmphasis(
  input: string,
  start: number,
): { node: MarkdownInline; next: number } | null {
  for (const [marker, type] of EMPHASIS) {
    if (!input.startsWith(marker, start)) continue;
    const underscore = marker.startsWith('_');
    // Otwarcie w środku wyrazu to `snake_case`, nie kursywa.
    if (underscore && isWordChar(input[start - 1])) continue;
    const after = input[start + marker.length];
    if (after === undefined || after === ' ') continue;
    const end = findClosing(input, marker, start + marker.length, underscore);
    // Pusta zawartość znaczy, że trafiliśmy w niedomknięty znacznik na początku
    // wiersza (`**nigdy niedomknięte`) — a nie w nacisk bez treści.
    if (end <= start + marker.length) continue;
    return {
      node: { type, children: parseMarkdownInline(input.slice(start + marker.length, end)) },
      next: end + marker.length,
    };
  }
  return null;
}

function matchLink(input: string, start: number): { node: MarkdownInline; next: number } | null {
  let depth = 0;
  let labelEnd = -1;
  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        labelEnd = index;
        break;
      }
    }
  }
  if (labelEnd < 0 || input[labelEnd + 1] !== '(') return null;
  const hrefEnd = input.indexOf(')', labelEnd + 2);
  if (hrefEnd < 0) return null;

  const label = input.slice(start + 1, labelEnd);
  const href = input.slice(labelEnd + 2, hrefEnd).trim();
  if (!isSafeMarkdownHref(href)) return null;
  return {
    node: { type: 'link', href, children: parseMarkdownInline(label) },
    next: hrefEnd + 1,
  };
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const ORDERED = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const FENCE = /^\s{0,3}```/;

/**
 * Rozkłada tekst na bloki. Nie rzuca wyjątków i nie zwraca błędów: cokolwiek
 * MG wpisze, jest tekstem — najgorszym możliwym wynikiem jest jeden akapit.
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index]!)) {
        body.push(lines[index]!);
        index += 1;
      }
      // Niedomknięty płot zjada resztę tekstu — tak samo jak w każdym markdownie.
      index += 1;
      blocks.push({ type: 'code', value: body.join('\n') });
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(heading[1]!.length, 3) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, children: parseMarkdownInline(heading[2]!.trim()) });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (index < lines.length) {
        const quoted = QUOTE.exec(lines[index]!);
        if (!quoted) break;
        body.push(quoted[1]!);
        index += 1;
      }
      blocks.push({ type: 'quote', children: parseMarkdownInline(body.join('\n').trim()) });
      continue;
    }

    const ordered = ORDERED.test(line);
    if (ordered || BULLET.test(line)) {
      const pattern = ordered ? ORDERED : BULLET;
      const items: MarkdownInline[][] = [];
      while (index < lines.length) {
        const item = pattern.exec(lines[index]!);
        if (!item) break;
        items.push(parseMarkdownInline(item[1]!.trim()));
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // Akapit: wszystko do pustego wiersza albo do wiersza, który zaczyna inny blok.
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index]!;
      if (current.trim().length === 0) break;
      if (
        FENCE.test(current) ||
        RULE.test(current) ||
        HEADING.test(current) ||
        QUOTE.test(current) ||
        BULLET.test(current) ||
        ORDERED.test(current)
      ) {
        break;
      }
      paragraph.push(current.trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', children: parseMarkdownInline(paragraph.join('\n')) });
  }

  return blocks;
}

/**
 * Czysty tekst z drzewa — do wyszukiwarki, do zajawki na liście i do miejsc,
 * w których formatowanie nie ma gdzie się pokazać (linia na czacie).
 */
export function markdownToPlainText(source: string): string {
  const inlineText = (nodes: MarkdownInline[]): string =>
    nodes
      .map((node) => {
        if (node.type === 'text' || node.type === 'code') return node.value;
        if (node.type === 'break') return ' ';
        return inlineText(node.children);
      })
      .join('');

  const parts: string[] = [];
  for (const block of parseMarkdown(source)) {
    if (block.type === 'rule') continue;
    if (block.type === 'code') parts.push(block.value);
    else if (block.type === 'list') parts.push(block.items.map(inlineText).join(' '));
    else parts.push(inlineText(block.children));
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
