/**
 * Skradanie się figury gracza przeciw Percepcji NPC-ów (etap 61, zlecenie MG
 * z 28.10).
 *
 * „Skradanie się (ZW) … Inne Postacie mogą spróbować cię wykryć Testem
 * Percepcji” (s. 130). Rzut przeciwstawny rozgrywa się jak przy ukrytej
 * figurze MG (58d), tylko w drugą stronę: skradający się rzuca raz, kubkiem,
 * na wezwanie z modyfikatorem MG, a jego wynik staje się PT dla każdego, kto
 * go zobaczy. Remis wygrywa skradający się — to on jest broniącym się
 * („W przypadku remisu Broniący zawsze wygrywa”, s. 169).
 *
 * Stan trybu zna rdzeń (`shared/sneak.ts`); tu mieszka tylko to, co jest
 * zasadą CP RED: czym się rzuca, kiedy patrzący wygrywa i jak MG nazywa
 * okoliczności.
 */

import type { CpredRollRequest } from './rolls.js';
import { CPRED_STEALTH_SKILL_ID } from './hiding.js';

/** Test, o który gracz prosi MG — ZW + Skradanie się. */
export function cpredSneakRequest(tokenId: string): CpredRollRequest {
  return { kind: 'skill', skillId: CPRED_STEALTH_SKILL_ID, sneakTokenId: tokenId };
}

/** Czy Percepcja patrzącego zauważa skradającego się: tylko wynik wyższy od PT. */
export function cpredSneakNoticed(perceptionTotal: number, sneakDv: number): boolean {
  return perceptionTotal > sneakDv;
}

/** Werdykt na karcie Testu Skradania — Test bez progu, którego wynik jest progiem. */
export function cpredSneakOutcome(total: number): {
  success: boolean;
  label: string;
  detail: string;
} {
  return {
    success: true,
    label: 'Skradasz się',
    detail: `Wynik ${total} — tyle musi przebić Percepcja tych, którzy cię zobaczą`,
  };
}

/** Jeden szczebel drabinki MG przy zgodzie: modyfikator do Testu Skradania. */
export interface CpredSneakModifierRung {
  value: number;
  /** Podpowiedź w dymku — przykłady, nie zasada. */
  note: string;
}

/**
 * Drabinka modyfikatora przy zgodzie (decyzja MG 2): dodatni pomaga
 * skradającemu się. Podręcznik nie drukuje tabeli dla Skradania — to przykłady
 * w skali modyfikatorów sytuacyjnych z s. 131.
 */
export const CPRED_SNEAK_MODIFIER_LADDER: readonly CpredSneakModifierRung[] = [
  { value: -4, note: 'Jasno i pusto, twarda posadzka, strażnik patrzy w tę stronę' },
  { value: -2, note: 'Żwir, szkło pod butami, cisza' },
  { value: 0, note: 'Zwykłe warunki' },
  { value: 2, note: 'Półmrok, hałas tła, tłum' },
  { value: 4, note: 'Ciemność, ulewa, zgiełk' },
];

/** „+2”, „−4”, „±0” — znak jak na karcie rzutu. */
export function cpredSneakModifierLabel(value: number): string {
  if (value === 0) return '±0';
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}
