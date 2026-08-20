import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Strażnik motywu (etap 27e).
 *
 * Kryterium etapu brzmi: „w `styles.css` nie ma literału koloru poza plikiem
 * motywu". To zdanie da się złamać jedną linią w każdym następnym etapie
 * i **nikt tego nie zauważy w ciemnym motywie** — dokładnie tak powstały dwa
 * błędy znalezione w 27e (biała nazwa broni w kompendium i czarny numer kroku
 * kreatora na czarnej belce). Stąd test zamiast dobrych chęci.
 */

const SRC = import.meta.dirname;
const read = (name: string) => readFileSync(join(SRC, name), 'utf8');

/** `#rgb`, `#rrggbb`, `rgb(12 34 56)`, `rgba(1, 2, 3, .4)` — ale nie `rgb(var(--x))`. */
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[\d.]/g;

/**
 * Jedyny dopuszczony wyjątek. `#000` w `mask-image` nie jest kolorem, tylko
 * kanałem krycia — znaczy „tutaj pokaż wszystko". Token z motywu podstawiłby
 * tam barwę i maska zaczęłaby wygaszać środek paska inicjatywy.
 */
const ALLOWED = new Set(['#000']);

/** Komentarze bywają pełne kolorów („czerwień #CC2316 spróbkowana z wydruku"). */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** `flatMap` zamiast `map`: grupa zawsze bierze udział, ale typ tego nie wie. */
function captures(css: string, pattern: RegExp): string[] {
  return [...css.matchAll(pattern)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
}

function tokensDefinedIn(css: string): string[] {
  return captures(css, /^[ \t]*(--[a-z0-9-]+)[ \t]*:/gm);
}

function tokensUsedIn(css: string): Set<string> {
  return new Set(captures(css, /var\([ \t]*(--[a-z0-9-]+)/g));
}

describe('motyw (etap 27e)', () => {
  for (const file of ['styles.css', 'sheet.css']) {
    it(`${file} nie zapisuje koloru wprost`, () => {
      const found = [...stripComments(read(file)).matchAll(COLOUR_LITERAL)]
        .map((m) => m[0])
        .filter((literal) => !ALLOWED.has(literal));
      expect(found).toEqual([]);
    });
  }

  it('każdy użyty token jest zdefiniowany w theme.css', () => {
    const defined = new Set(tokensDefinedIn(read('theme.css')));
    const used = tokensUsedIn(['styles.css', 'sheet.css'].map(read).join('\u000a'));
    /**
     * Tokeny ustawiane w miejscu przez samą regułę — nie należą do motywu, bo
     * ich wartość zależy od stanu elementu, a nie od pory dnia.
     */
    const local = new Set(['--hud-hp-color', '--rattle']);
    expect([...used].filter((t) => !defined.has(t) && !local.has(t))).toEqual([]);
  });

  it('theme.css nie wozi tokenu bez odbiorcy', () => {
    const theme = read('theme.css');
    const defined = new Set(tokensDefinedIn(theme));
    const used = tokensUsedIn([read('styles.css'), read('sheet.css'), theme].join('\u000a'));
    expect([...defined].filter((t) => !used.has(t))).toEqual([]);
  });

  it('noc i dzień opisują ten sam zestaw tokenów chromu', () => {
    const theme = read('theme.css');
    /**
     * Interesuje nas pierwszy blok `:root` (chrom) i jego para dzienna. Reszta
     * bloków — mapa, Sieć, gazeta — celowo nie ma wariantu dziennego, więc
     * porównywanie ich byłoby sprawdzaniem, czy decyzja MG nadal obowiązuje.
     */
    const block = (selector: string) => {
      const start = theme.indexOf(`${selector} {`);
      expect(start, `brak bloku ${selector}`).toBeGreaterThanOrEqual(0);
      const end = theme.indexOf('\u000a}', start);
      expect(end, `blok ${selector} bez zamknięcia`).toBeGreaterThan(start);
      return new Set(tokensDefinedIn(theme.slice(start, end)));
    };
    const night = block(':root');
    const day = block(":root[data-theme='day']");
    /** Tokeny bez wariantu dziennego — albo stałe, albo pochodne akcentu. */
    const nightOnly = new Set([
      '--cup-glow',
      '--dice-creation',
      '--dice-creation-rgb',
      '--swatch-edge',
      '--swatch-gloss',
      '--emoji-glyph-size',
      '--ok-line',
      '--remind-rgb',
      '--neutral-rgb',
      '--shadow-sheet',
    ]);
    expect([...night].filter((t) => !day.has(t) && !nightOnly.has(t))).toEqual([]);
  });
});
