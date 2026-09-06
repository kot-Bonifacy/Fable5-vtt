import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseChatInput } from '@vtt/shared';

/**
 * Strażnik rozstrzygnięcia, na którym stoi cały etap 34: **tabela nie dotyka
 * kubka.**
 *
 * `rollStore` ma jeden slot naraz — każdy `load…Cup` rozsypuje przed sobą
 * `EMPTY_CUP`, czyli czyści wszystkie pozostałe. Gdyby losowanie z tabeli
 * ładowało kubek, to MG, który wziął do ręki rzut Percepcji NPC-a, straciłby go
 * w chwili kliknięcia „Losuj", a czekające u gracza wezwanie do Testu z etapu 32
 * zostałoby zdmuchnięte sprzed nosa.
 *
 * Test jest źródłowy, bo taka jest natura tej reguły: nie da się jej sprawdzić
 * asercją o stanie po akcji, która ze stanem nie ma nic wspólnego — a złamie ją
 * dopiero **dopisanie** wywołania, którego dziś nie ma. Ten sam kształt ma
 * strażnik przycisków ikonowych z 27f (`a11y.test.ts`).
 */

const SRC = join(import.meta.dirname);

/** Sam kod, bez komentarzy — te wolno (i trzeba) o kubku pisać. */
function code(file: string): string {
  return readFileSync(join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Wszystko, co po stronie klienta obsługuje tabele losowe. */
const TABLE_FILES = [
  'components/TablePanel.tsx',
  'components/RollTableCard.tsx',
  'stores/tableStore.ts',
];

describe('tabele losowe a kubek (etap 34)', () => {
  it('ścieżka losowania nie sięga do rollStore', () => {
    for (const file of TABLE_FILES) {
      expect(code(file), `${file} nie ma prawa dotykać kubka`).not.toMatch(
        /rollStore|loadCup|load[A-Z]\w*Cup|clearCup/,
      );
    }
  });

  it('kubek rozpoznaje /tab osobnym trybem, nie udając rzutu', () => {
    // Gdyby `/tab` parsowało się jako `roll`, kubek wysłałby na czat formułę,
    // której nikt nie wpisał — a drabinka `CupMode` ma zostać bez zmian.
    const parsed = parseChatInput('/tab spotkania');
    expect(parsed.kind).toBe('rolltable');

    // Tryb tabeli jest wybierany POD wezwaniem — inaczej odebrałby mu
    // pierwszeństwo. Kolejność w drabince czyta się z `openCheckCallFor`,
    // nie z deklaracji typu (ta jest tylko listą wariantów).
    const cup = code('components/DiceCup.tsx');
    expect(cup.indexOf('openCheckCallFor(items')).toBeLessThan(
      cup.indexOf("parsed.kind === 'rolltable'"),
    );
  });
});
