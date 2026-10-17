import type { CombatView, TokenView } from '@vtt/shared';

/**
 * Kogo MG prowadzi w walce (etap 50b, decyzje MG z 10.10 wzorem Foundry VTT).
 *
 * Czyste funkcje bez magazynów i Pixi — wołają je `MapArea` (zmiana tury,
 * blokada zaznaczania) i testy.
 */

/**
 * Czy klik na mapie MG ma przestać zaznaczać figury inne niż prowadzona.
 *
 * Od rundy 1: w „Przed walką” (runda 0) MG układa starcie i zaznacza klikiem
 * jak zawsze (decyzja MG z 10.10).
 */
export function gmSteerLocked(isGm: boolean, combat: CombatView | null): boolean {
  return isGm && combat !== null && combat.round >= 1;
}

/**
 * Czy zmiana widoku walki to przejście tury **w tej samej** walce.
 *
 * Wejście na scenę z trwającą walką, przeładowanie strony i nowa walka nie
 * odbierają MG tego, co właśnie trzyma — tylko tura, która minęła przy stole.
 */
export function isTurnChangeInFight(previous: CombatView | null, next: CombatView | null): boolean {
  if (!previous || !next || previous.id !== next.id) return false;
  return previous.round !== next.round || previous.activeCombatantId !== next.activeCombatantId;
}

/**
 * Co MG dostaje na początku tury.
 *
 * - `steer` — tura NPC-a (uczestnik bez właściciela, figura na scenie, nie
 *   pojemnik; ta sama reguła co „⚔ Rozpocznij walkę”): zaznaczenie, pasek
 *   akcji i kadr kamery.
 * - `watch` — tura gracza albo uczestnika bez figury: MG nie prowadzi nic,
 *   a pasek pokazuje figurę w turze w podglądzie (`tokenId`, gdy jest).
 *
 * `null` — przed rundą 1 albo bez walki: nic się nie zmienia.
 */
export type GmTurnSteer =
  { kind: 'steer'; tokenId: string } | { kind: 'watch'; tokenId: string | null };

export function gmTurnSteer(
  combat: CombatView | null,
  tokens: Readonly<Record<string, TokenView>>,
): GmTurnSteer | null {
  if (!combat || combat.round < 1) return null;
  const acting = combat.combatants.find((c) => c.id === combat.activeCombatantId) ?? null;
  const token = acting?.tokenId ? tokens[acting.tokenId] : undefined;
  if (!acting || !token) return { kind: 'watch', tokenId: null };
  if (acting.ownerId === null && token.container === undefined) {
    return { kind: 'steer', tokenId: token.id };
  }
  return { kind: 'watch', tokenId: token.id };
}

/**
 * Którą figurę gracz dostaje na początku tury (zlecenie MG z 17.10, wzorem
 * Foundry): w turze jego postaci — jej figurę, zaznaczoną i w kadrze kamery,
 * bez względu na to, co klikał ostatnio. Tura cudza, uczestnik bez figury
 * albo figura, której gracz nie widzi — `null`, nic się nie zmienia.
 */
export function playerTurnSteer(
  combat: CombatView | null,
  tokens: Readonly<Record<string, TokenView>>,
  userId: string | null,
): string | null {
  if (!combat || combat.round < 1 || !userId) return null;
  const acting = combat.combatants.find((c) => c.id === combat.activeCombatantId) ?? null;
  const token = acting?.tokenId ? tokens[acting.tokenId] : undefined;
  return token && token.ownerId === userId ? token.id : null;
}
