/**
 * Karta, która ginie razem z figurą (etap 38a).
 *
 * Od 38a każda ostatystykowana figura ma prawdziwy rekord `Character`, a MG
 * rozstrzygnął 05.09, że **nie ma** znacznika odróżniającego kartę gangera od
 * karty Vex: ganger stoi w rosterze obok niej. Skoro nie ma znacznika, serwer
 * nie ma po czym poznać, którą kartę skasować razem z figurą — więc to jest
 * **pytanie, nie automat**, i zadaje je ta strona, bo tu widać cały stół naraz.
 *
 * Trzy warunki, i każdy zarabia na siebie:
 *
 *  - karta **bez właściciela**. Karta gracza nigdy nie ginie z figurą: dwie
 *    figury Vex to nadal jedna Vex, a jedno przypadkowe „tak" zabrałoby postać;
 *  - **żadnej innej figury** pod tą kartą. Ten sam ganger postawiony na drugiej
 *    scenie ma przeżyć skasowanie tej;
 *  - karta jest **znana temu ekranowi**. Gracz kart NPC nie dostaje, więc
 *    u niego pytanie nie pada — i dobrze, bo kasowanie figur i tak ma MG.
 *
 * Serwer sprawdza pierwsze dwa jeszcze raz (`token:delete`), bo odpowiedź
 * klienta jest prośbą, a nie rozstrzygnięciem.
 */

import type { TokenView } from '@vtt/shared';
import { useCharacterStore } from './stores/characterStore.js';
import { useTokenStore } from './stores/tokenStore.js';

/** Nazwa karty do skasowania, albo null, gdy nie ma o co pytać. */
export function figureCardName(token: Pick<TokenView, 'id' | 'characterId'>): string | null {
  if (!token.characterId) return null;
  const character = useCharacterStore.getState().characters[token.characterId];
  if (!character || character.ownerId !== null) return null;
  const tokens = useTokenStore.getState().tokens;
  const elsewhere = Object.values(tokens).some(
    (row) => row.id !== token.id && row.characterId === token.characterId,
  );
  return elsewhere ? null : character.name;
}

/**
 * Pyta o kartę i zwraca odpowiedź. `false` znaczy „zostaw kartę", a nie
 * „przerwij" — kasowanie figury dzieje się tak czy inaczej, bo o nim MG
 * zdecydował już wcześniej.
 */
export function askAboutFigureCard(token: Pick<TokenView, 'id' | 'characterId'>): boolean {
  const name = figureCardName(token);
  if (name === null) return false;
  return window.confirm(`Usunąć też kartę „${name}”? Zostanie w kampanii, jeśli odmówisz.`);
}
