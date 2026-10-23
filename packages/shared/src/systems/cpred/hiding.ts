/**
 * Ukryta figura przeciw Percepcji (etap 58d, decyzja MG 7 z 22.10).
 *
 * Rdzeń wie tylko, że figura jest ukryta i komu się odsłoniła
 * (`Token.hidden`, `tokenHiddenFrom`). To, że postać gracza zauważa ją
 * Testem Percepcji przeciw Skradaniu, mieszka tutaj.
 *
 * **Rzut przeciwstawny jako PT.** Skradanie NPC-a (ZW + Skradanie + 1k10)
 * rzuca serwer w chwili wezwania, a wynik staje się PT wezwania gracza.
 * To ten sam werdykt co rzut przeciwstawny z s. 130 — remis wygrywa broniący
 * się, czyli ukryty — a karta wezwania wygląda jak każde wezwanie MG z PT
 * (uwaga MG z 23.10: wezwanie nie może zdradzać, że obok ktoś się czai;
 * „druga strona: 12 + 1k10” mówiłaby to wprost).
 *
 * Figura bez karty nie ma czym rzucić Skradania — bierze PT, które wpisał jej
 * MG. Bez karty i bez PT figury nikt sam nie zauważy (MG odsłania ją ręką).
 */

import { rollFormula, type DiceRng } from '../../dice.js';

/** Umiejętność ukrywającego się — „Skradanie” (ZW). */
export const CPRED_STEALTH_SKILL_ID = 'stealth';

/** Skąd wzięło się PT: rzut Skradania z karty czy liczba od MG. */
export type CpredHidingDv =
  | { source: 'stealth'; dv: number; base: number; die: number; label: string }
  | { source: 'gm'; dv: number };

/**
 * PT, które musi przebić Percepcja gracza, albo `null`, gdy figury nie da się
 * zauważyć Testem. `stealth` — podstawa Skradania z karty figury (ZW +
 * Skradanie); nieobecna, gdy figura nie ma karty.
 */
export function cpredHidingDv(
  input: { stealth?: { total: number; label: string } | null; spotDv?: number | null },
  rng: DiceRng,
): CpredHidingDv | null {
  if (input.stealth) {
    const rolled = rollFormula(
      {
        terms: [
          { kind: 'dice', sign: 1, count: 1, sides: 10 },
          ...(input.stealth.total !== 0
            ? [{ kind: 'modifier' as const, sign: 1 as const, value: input.stealth.total }]
            : []),
        ],
      },
      rng,
      { checkRule: true },
    );
    return {
      source: 'stealth',
      dv: rolled.total,
      base: input.stealth.total,
      die: rolled.total - input.stealth.total,
      label: input.stealth.label,
    };
  }
  if (typeof input.spotDv === 'number') return { source: 'gm', dv: input.spotDv };
  return null;
}

/** Wiersz MG: skąd PT tej kryjówki — „Skradanie 12 + 7 = 19” albo „PT od MG 15”. */
export function cpredHidingDvText(hiding: CpredHidingDv): string {
  if (hiding.source === 'gm') return `PT od MG ${hiding.dv}`;
  return `${hiding.label} ${hiding.base} + ${hiding.die} = ${hiding.dv}`;
}
