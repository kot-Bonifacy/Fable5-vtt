import type { DragEvent } from 'react';
import type { TokenPlacement } from '../stores/mapToolStore.js';

/**
 * Żeton przeciągany z panelu na mapę (zlecenie MG, 26.09.2026).
 *
 * Do tej pory nową figurę stawiało się dwoma kliknięciami: wybór w bibliotece
 * albo „⊕" przy postaci, potem klik na mapie. Przeciągnięcie jest trzecią drogą
 * do **tego samego** `token:create` — niesie ten sam `TokenPlacement`, więc
 * żeton postaci dostaje kartę i właściciela dokładnie tak jak z kliknięcia.
 *
 * Własny typ MIME, a nie `text/plain`: mapa przyjmuje tylko to, co wyszło
 * z panelu, i nie próbuje stawiać figury z zaznaczonego tekstu czy linku
 * upuszczonego z innej karty przeglądarki.
 */
export const TOKEN_DRAG_MIME = 'application/x-vtt-token';

export function startTokenDrag(event: DragEvent<HTMLElement>, placement: TokenPlacement): void {
  event.dataTransfer.setData(TOKEN_DRAG_MIME, JSON.stringify(placement));
  event.dataTransfer.effectAllowed = 'copy';
  // Za kursorem ma iść sam portret, nie cały wiersz z przyciskami i listą
  // właścicieli — tak to wygląda jak figura wzięta do ręki.
  const image = event.currentTarget.querySelector('img');
  if (image && image.complete && image.naturalWidth > 0) {
    event.dataTransfer.setDragImage(image, image.width / 2, image.height / 2);
  }
}

/**
 * Czy to, co wisi nad mapą, jest żetonem z panelu.
 *
 * W `dragover` przeglądarka pokazuje wyłącznie **typy** danych, nie treść —
 * stąd osobne pytanie, zanim `readTokenDrag` będzie mogło cokolwiek przeczytać.
 */
export function isTokenDrag(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes(TOKEN_DRAG_MIME);
}

/** Treść upuszczonego żetonu albo `null`, gdy to nie żeton z panelu. */
export function readTokenDrag(event: DragEvent<HTMLElement>): TokenPlacement | null {
  const raw = event.dataTransfer.getData(TOKEN_DRAG_MIME);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TokenPlacement> | null;
    if (!value || typeof value.name !== 'string') return null;
    return {
      name: value.name,
      imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : null,
      ...(typeof value.characterId === 'string' ? { characterId: value.characterId } : {}),
      ...(typeof value.ownerId === 'string' ? { ownerId: value.ownerId } : {}),
    };
  } catch {
    return null;
  }
}
