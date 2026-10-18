/**
 * Kiedy renderer zgłasza zmianę prowadzonej figury do store'u.
 *
 * Osobno od `MapRenderer`, z tego samego powodu co `token-ring.ts`: to czysta
 * reguła, a renderer ciągnie za sobą całe Pixi.
 */

/**
 * Why the steered figure changed.
 *
 * The left rail keeps describing a figure after it stops being steered, so it
 * has to tell „the user said never mind" from „the map was swapped under it".
 * The renderer is the only thing that knows which of the four just happened.
 */
export type SelectionChange =
  /** A click on a figure, or `Tab`. */
  | 'pick'
  /** „Never mind" — right click on bare map, or the last rung of Escape. */
  | 'dismiss'
  /** The scene was swapped out. */
  | 'scene'
  /** The figure left the map (deleted, or moved out of sight). */
  | 'gone';

/**
 * Czy `setSelection(next, reason)` ma dotrzeć do store'u.
 *
 * Zmiana figury — zawsze. Ta sama figura jeszcze raz — tylko wtedy, gdy store
 * mógł się od renderera rozjechać, a od 31.08 może: klik w cudzą figurę
 * przestawia pasek (`focus`), nie ruszając prowadzenia. Ponowny `pick` własnej
 * figury musi więc pasek do niej sprowadzić — inaczej klik we własny żeton
 * i zmiana tury na turę gracza zostawiały w pasku portret ostatnio podglądanej
 * cudzej figury (zgłoszenie MG, 18.10.2026).
 *
 * `dismiss` i `scene` przechodzą z tego samego powodu w drugą stronę: „nic nie
 * pokazuj" ma co zdjąć, kiedy nic nie jest prowadzone, a zmiana sceny musi
 * sięgnąć pamięci paska na nowej mapie. Zostaje `gone` i `pick(null)`, które
 * same z siebie niczego w pasku nie zmieniają.
 */
export function reportsSelection(
  current: string | null,
  next: string | null,
  reason: SelectionChange,
): boolean {
  if (current !== next) return true;
  if (reason === 'dismiss' || reason === 'scene') return true;
  return reason === 'pick' && next !== null;
}
