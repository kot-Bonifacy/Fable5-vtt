import type { RollResult } from '@vtt/shared';

/**
 * Czy karta rzutu ma pisać sumę „= N” w wierszu kości (03.11, zlecenie MG).
 *
 * Duża liczba po prawej od tytułu zniknęła: przy Teście ta sama suma stoi już
 * na początku plakietki wyniku („21 > PT 15”, „21 vs 18”), więc druga kopia to
 * szum. Wyniki bez PT (obrażenia, `/r`, inicjatywa, atak — jego werdykt podaje
 * PT, nie sumę) i plakietki, które sumy nie zaczynają („Skaner”, „Targ dobity”),
 * dostają ją w treści. Rozstrzyga tekst plakietki, a nie rodzaj rzutu, bo
 * wyniki składa kilkanaście miejsc serwera i nowe nie musi o tym pamiętać:
 * gorszy przypadek to suma napisana dwa razy, nigdy wcale.
 */
export function rollShowsTotal(roll: Pick<RollResult, 'total' | 'outcome'>): boolean {
  const detail = roll.outcome?.detail;
  if (!detail) return true;
  const lead = /^\s*(-?\d+)(?!\d)/.exec(detail);
  return lead === null || Number(lead[1]) !== roll.total;
}
