import type { FloatingWindow } from '../window-placement.js';

/**
 * Uchwyt skalowania w prawym dolnym rogu pływającego okna (etap 27f).
 *
 * Trzy ukośne kreski w rogu to ten sam znak, którym Foundry, Windows i każdy
 * edytor mówi „tu można pociągnąć" — dlatego rysuje je CSS, a nie ikona:
 * gradient skaluje się z motywem i nie dokłada pliku do pobrania.
 *
 * `aria-hidden` jest świadome: skalowanie okna myszą nie ma sensownego
 * odpowiednika dla czytnika ekranu, a treść okna jest dostępna niezależnie od
 * jego rozmiaru. Klawiaturowy odpowiednik przeciągania to osobna rozmowa
 * (wpis w `POMYSLY.md`).
 */
export function WindowResizeGrip({ resizeProps }: { resizeProps: FloatingWindow['resizeProps'] }) {
  return (
    <div className="window-resizer" aria-hidden="true" title="Zmień rozmiar" {...resizeProps} />
  );
}
