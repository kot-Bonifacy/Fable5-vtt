import type { DragEvent } from 'react';
import { DEFAULT_PORTRAIT_CROP, portraitCropPlacement } from '@vtt/shared';
import type { TokenPlacement } from '../stores/mapToolStore.js';
import { usePortraitStore } from '../stores/portraitStore.js';

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
    const figure = figureDragImage(image, placement.imageUrl);
    if (figure) {
      event.dataTransfer.setDragImage(figure, DRAG_FIGURE_PX / 2, DRAG_FIGURE_PX / 2);
      // Przeglądarka robi zrzut elementu w chwili `dragstart`; potem płótno
      // może zniknąć z dokumentu.
      setTimeout(() => figure.remove(), 0);
    }
  }
}

/** Bok krążka za kursorem — mniej więcej figura na mapie w zwykłym przybliżeniu. */
const DRAG_FIGURE_PX = 56;

/**
 * Okrągła figura z portretu, w kadrze żetonu (etap 49a, uwaga MG z 10.10).
 *
 * `setDragImage(img)` pokazuje obraz w **naturalnym** rozmiarze pliku, więc za
 * kursorem jechał portret na pół ekranu zamiast figury. Płótno ma wymiar
 * krążka i ten sam kadr co żeton na mapie (`portraitCropPlacement`), a Chrome
 * rysuje obraz przeciągania tylko z elementu w dokumencie — stąd płótno
 * odstawione poza ekran na czas jednego `dragstart`.
 */
function figureDragImage(image: HTMLImageElement, url: string | null): HTMLCanvasElement | null {
  const ratio = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(DRAG_FIGURE_PX * ratio);
  canvas.style.cssText = `position:fixed;left:-${4 * DRAG_FIGURE_PX}px;top:0;width:${DRAG_FIGURE_PX}px;height:${DRAG_FIGURE_PX}px;pointer-events:none`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(ratio, ratio);
  const radius = DRAG_FIGURE_PX / 2;
  ctx.beginPath();
  ctx.arc(radius, radius, radius - 1.5, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();
  const crop = (url && usePortraitStore.getState().crops.get(url)) || DEFAULT_PORTRAIT_CROP;
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const place = portraitCropPlacement(crop, { width, height }, DRAG_FIGURE_PX);
  ctx.drawImage(
    image,
    radius - width * place.scale * place.anchorX,
    radius - height * place.scale * place.anchorY,
    width * place.scale,
    height * place.scale,
  );
  ctx.restore();
  // Obwódka w kolorze akcentu motywu — kolory mieszkają w `theme.css`.
  ctx.lineWidth = 2;
  ctx.strokeStyle =
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || 'red';
  ctx.stroke();
  document.body.appendChild(canvas);
  return canvas;
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
