import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Skrypt kości dla testów E2E (plan testów bety, `testy.md` 4.2; zgoda MG z 26.09.2026).
 *
 * `VTT_DICE_SCRIPT` wskazuje plik z kolejką wymuszonych ścianek. Każda kość, którą
 * serwer losuje przez `createMixedRng`, zdejmuje z pliku pierwszą wartość; pusta
 * kolejka (albo brak pliku) wraca do zwykłego, kryptograficznego losowania. Tak
 * scenariusz przechodzi przez gałąź, która przy stole wypada rzadko — ranę
 * krytyczną, nieudany Death Save — bez udawania wyniku po stronie klienta.
 *
 * **W produkcji (`NODE_ENV=production`) zmienna jest ignorowana** — serwer na VPS
 * nie ma żadnej drogi, którą ktoś mógłby ustawić kości.
 *
 * Format pliku: liczby rozdzielone spacjami, przecinkami lub nowymi wierszami;
 * `#` do końca wiersza to komentarz. Kolejność to kolejność losowania kości przez
 * serwer (dopisek Krytyka po 10 na k10 to następna kość z kolejki).
 */
export function diceScriptPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const path = env.VTT_DICE_SCRIPT;
  if (!path || env.NODE_ENV === 'production') return null;
  return path;
}

/** Kolejka z treści pliku; śmieć zamiast liczby to błąd skryptu, nie pusta kolejka. */
export function parseDiceScript(text: string): number[] {
  return text
    .replace(/#[^\n]*/g, ' ')
    .split(/[\s,]+/)
    .filter((token) => token.length > 0)
    .map((token) => {
      const value = Number(token);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error(`VTT_DICE_SCRIPT: "${token}" is not a die face`);
      }
      return value;
    });
}

/**
 * Zdejmuje pierwszą wartość z kolejki i zapisuje resztę. `null` = kolejka pusta.
 *
 * Wartość większa od liczby ścian rzucanej kości wysadza rzut — cichy powrót do
 * losowania dałby test, który przechodzi przez inną gałąź, niż myśli jego autor.
 */
export function takeScriptedDie(path: string, sides: number): number | null {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const queue = parseDiceScript(text);
  const value = queue.shift();
  if (value === undefined) return null;
  writeFileSync(path, queue.join(' '));
  if (value > sides) {
    throw new Error(`VTT_DICE_SCRIPT: ${value} is not a face of d${sides}`);
  }
  return value;
}
