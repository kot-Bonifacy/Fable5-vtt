/**
 * Kilka celów na jednym polu (03.11.2026, zlecenie MG).
 *
 * Stos figur na jednej kratce (albo heksie) jest dozwolony — MG stawia tak
 * wrogów, a statysta z wzorca ląduje często na polu poprzednika. Pixi oddaje
 * klik wyłącznie figurze z wierzchu, więc gracz nie miał jak strzelić w tę pod
 * spodem: celownik zawsze trafiał w górną. Ta funkcja mówi, kogo jeszcze ten
 * sam klik mógłby wskazać; gdy więcej niż jedną figurę, mapa pyta o wybór.
 *
 * Czysta i bez Pixi, żeby dało się ją przetestować; regułę „w kogo ten klik
 * może celować” podaje wołający (`MapRenderer.aimTargetFor`).
 */

export interface StackedFigure {
  id: string;
  /** Lewy górny róg figury w pikselach świata. */
  x: number;
  y: number;
  /** Bok figury w pikselach świata (pole klikalne to kwadrat `side × side`). */
  side: number;
  /** Kolejność rysowania — większa leży wyżej (najpierw `zIndex`, potem indeks w warstwie). */
  order: number;
}

/**
 * Figury pod punktem `(x, y)`, w które można wycelować — od wierzchu stosu.
 *
 * Kliknięta figura idzie zawsze pierwsza (to ją pokazywał celownik pod
 * kursorem), reszta w kolejności od góry. Pusta lista nie wychodzi nigdy:
 * kliknięta figura jest celem, nawet gdy jej pole już się przesunęło.
 */
export function stackedTargetsAt(
  clickedId: string,
  figures: readonly StackedFigure[],
  x: number,
  y: number,
  canTarget: (id: string) => boolean,
): string[] {
  const under = figures
    .filter(
      (figure) =>
        figure.id !== clickedId &&
        x >= figure.x &&
        x < figure.x + figure.side &&
        y >= figure.y &&
        y < figure.y + figure.side &&
        canTarget(figure.id),
    )
    .sort((a, b) => b.order - a.order)
    .map((figure) => figure.id);
  return [clickedId, ...under];
}
