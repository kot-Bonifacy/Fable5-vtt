import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Strażnik przycisków ikonowych (etap 27f).
 *
 * Przycisk, którego całą treścią jest znak graficzny (`✕`, `🎲`, `⟳`), nie
 * mówi sam z siebie nic: bez `title` nie powie tego kursorowi, a bez
 * `aria-label` czytnik ekranu odczyta nazwę znaku Unicode („heavy multiplication
 * X"), co jest gorsze niż cisza. Ikony rysowane w SVG (`MapIcons`, `UiIcons`)
 * są `aria-hidden`, więc **tam** `title` wystarcza za nazwę dostępną — i dlatego
 * ten test ich nie dotyczy.
 *
 * Do 27f pięćdziesiąt przycisków miało sam `title`. Poprawka była kodemodem,
 * ale to znaczy, że następny taki przycisk powstanie tak samo — stąd test.
 */

const SRC = join(import.meta.dirname);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

/** Koniec znacznika: `>` poza klamrami i nie ten ze strzałki `=>`. */
function tagEnd(source: string, from: number): number {
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    const char = source[i];
    if (char === '{') depth++;
    else if (char === '}') depth--;
    else if (depth === 0 && char === '>' && source[i - 1] !== '=') return i;
  }
  return -1;
}

/** Sama treść przycisku, bez znaczników i wyrażeń. */
const GLYPH_ONLY = /^[^\p{L}\p{N}<>{}]+$/u;

describe('przyciski ikonowe (etap 27f)', () => {
  it('przycisk z samym znakiem graficznym ma title i aria-label', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (let at = source.indexOf('<button'); at !== -1; at = source.indexOf('<button', at + 1)) {
        const end = tagEnd(source, at + '<button'.length);
        if (end === -1) continue;
        const close = source.indexOf('</button>', end);
        if (close === -1) continue;
        const attributes = source.slice(at + '<button'.length, end);
        const body = source.slice(end + 1, close).trim();
        // Zagnieżdżony przycisk znaczy, że rozjechało się parowanie znaczników.
        if (body.includes('<button')) continue;
        if (!GLYPH_ONLY.test(body)) continue;
        if (/\btitle=/.test(attributes) && /\baria-label=/.test(attributes)) continue;
        const line = source.slice(0, at).split(/\r?\n/).length;
        offenders.push(`${file.slice(SRC.length + 1)}:${line} — „${body}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
