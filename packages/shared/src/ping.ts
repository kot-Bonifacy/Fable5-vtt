/**
 * Ping na mapie (etap 35) — rdzeń VTT, bez udziału systemu gry.
 *
 * „Patrzcie na te drzwi" pisało się do 05.09 na czacie, bo `gm:ping` z etapu 03
 * było **atrapą** (`handler: () => undefined`) i nigdy nie dostało treści.
 *
 * Ping ma dokładnie te same własności co linijka z `measure.ts` i to nie jest
 * zbieg okoliczności: jedno i drugie jest **czystą prezentacją**. Nie zapisuje
 * się w bazie, nie dostaje `seq`, nie wraca przy resynchronizacji i nie zostawia
 * wiersza czatu — bo ping jest czymś, co się **stało**, a nie czymś, co **jest**.
 * Kto nie patrzył, ten nie zobaczył, i tak ma być: trwały znacznik to notatka MG
 * (17a) albo rysunek (17b), a nie to.
 *
 * Jedyna różnica względem linijki: **wariant „przyciągnij widok"** (`pull`).
 * Ping przesuwa wtedy kamerę każdego, kto ogląda tę scenę — dlatego jest
 * wyłącznie dla MG. Zabranie graczowi kontroli nad tym, na co patrzy, to
 * uprawnienie prowadzącego, a nie gest do rozdania wszystkim przy stole.
 */

import type { ScenePoint } from './measure.js';

/** Jak długo ping zostaje na ekranie, zanim zgaśnie sam z siebie. */
export const MAP_PING_TTL_MS = 2200;

/** Client → server payload of `map:ping`. */
export interface MapPingPayload {
  sceneId: string;
  x: number;
  y: number;
  /** MG: przyciągnij widok wszystkich oglądających tę scenę. */
  pull?: boolean;
}

/**
 * Server → client `map:ping`. Efemeryczny jak pośrednie klatki przeciągania
 * figury: bez `seq`, bez zapisu, bez powtórki.
 */
export interface MapPingBroadcast {
  sceneId: string;
  userId: string;
  userName: string;
  x: number;
  y: number;
  /** Prawda wyłącznie wtedy, gdy serwer przyznał MG prawo do przesunięcia kamery. */
  pull: boolean;
}

/**
 * Sprawdza punkt pingu przychodzący z drutu: dwie skończone liczby zaokrąglone
 * do pełnych pikseli. Null znaczy „payload nie do użytku" — a nie „ping poza
 * mapą": granice sceny sprawdza wołający, bo to on ma scenę pod ręką.
 */
export function sanitizePingPoint(x: unknown, y: unknown): ScenePoint | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  if (typeof y !== 'number' || !Number.isFinite(y)) return null;
  return { x: Math.round(x), y: Math.round(y) };
}
