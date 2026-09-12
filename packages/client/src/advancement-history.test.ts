import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Strażnik rozstrzygnięcia z oględzin 09.09: **rejestr awansów czyta się na
 * stempel karty, a nie raz, przy pierwszym otwarciu.**
 *
 * Etap 29a dał rejestrowi jedno wywołanie w `buy()` — świeży wiersz po własnym
 * zakupie — i na tym poprzestał. Tymczasem PD dopisuje przede wszystkim **nie
 * ta karta**: pulę po sesji i korektę wpisuje MG (`character:xp-award`,
 * `character:update`). Otwarty rejestr zostawał wtedy przy liście sprzed
 * przyznania, choć licznik nad nim już rósł — a zamknięcie i ponowne otwarcie
 * nic nie dawało, bo warunek pytał o `history === null`. Jedyną drogą do
 * prawdy było przeładowanie strony, i to dokładnie w tej chwili, w której
 * gracz patrzy na rejestr najczęściej.
 *
 * Wyzwalaczem musi być `updatedAt` — **stempel serwera, nie saldo**. To ta sama
 * umowa, którą rejestr eurodolców z 23b zapisał w `CharacterSheet.tsx`: własna
 * łata karty ląduje w składzie optymistycznie, więc licznik zna nową liczbę,
 * zanim żądanie wyjdzie, a lista czytana na saldzie wróciłaby bez wiersza,
 * który dopiero powstaje.
 *
 * Test jest źródłowy, wzorem `tables-cup.test.ts` z etapu 34 i
 * `check-request-cup.test.ts` z etapu 40: klient nie ma DOM-u w testach, a
 * regułę da się złamać wyłącznie przez edycję tego jednego pliku.
 */

const SRC = join(import.meta.dirname);

/** Sam kod, bez komentarzy — te wolno (i trzeba) o rejestrze pisać. */
function code(file: string): string {
  return readFileSync(join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('rejestr awansów nadąża za PD dopisanymi spoza karty (oględziny 09.09)', () => {
  const panel = code(join('components', 'AdvancementPanel.tsx'));

  it('bierze wyzwalacz ze stempla karty, nie z salda', () => {
    expect(panel).toMatch(/const\s+savedAt\s*=\s*character\?\.updatedAt/);
    // Saldo jako wyzwalacz to ta sama pułapka, którą 23b opisało przy
    // eurodolcach: optymistyczna łata wyprzedza żądanie.
    expect(panel).not.toMatch(/\[\s*characterId\s*,\s*open\s*,\s*points\s*\]/);
  });

  it('czyta rejestr przy każdym otwarciu, a nie tylko przy pierwszym', () => {
    const effect = panel.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[([^\]]*)\]\);/);
    expect(effect).not.toBeNull();
    const deps = (effect?.[1] ?? '').split(',').map((d) => d.trim());
    expect(deps).toContain('open');
    expect(deps).toContain('savedAt');
    expect(deps).toContain('characterId');
  });

  it('nie warunkuje wczytania na pustej liście', () => {
    // „history === null" było powodem, dla którego zamknięcie i ponowne
    // otwarcie rejestru nie przynosiło nowego wiersza.
    expect(panel).not.toMatch(/history\s*===\s*null\s*\)\s*void/);
    expect(panel).toMatch(/onToggle=\{\(e\) => setOpen\(/);
  });

  it('nie zostawia drugiej drogi do rejestru w samym zakupie', () => {
    // Jedna droga dla wiersza własnego i dla tego, który dopisał MG —
    // inaczej wraca stan, w którym jeden przypadek działa, a drugi nie.
    const buy = panel.match(/async function buy\([\s\S]*?\n {2}\}/)?.[0] ?? '';
    expect(buy).not.toMatch(/loadHistory|fetchAdvancementHistory/);
  });
});
