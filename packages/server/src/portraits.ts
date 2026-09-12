import type { PortraitAssetView } from '@vtt/shared';
import { clampPortraitCrop } from '@vtt/shared';

/** Tyle z wiersza `PortraitAsset` potrzeba, żeby zbudować widok puli. */
export interface PortraitAssetRow {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  cropX: number;
  cropY: number;
  cropZoom: number;
}

/**
 * Wiersz puli portretów tak, jak widzi go stół.
 *
 * Jedno miejsce na cztery trasy i jedno rozgłoszenie, bo kadr doszedł 12.09 do
 * widoku, który był wtedy budowany z ręki w czterech miejscach — i trzy z nich
 * milczałyby o nim do pierwszego przeładowania strony.
 *
 * Kadr jedzie przez `clampPortraitCrop`, a nie prosto z bazy: kolumny mają
 * wartości domyślne, ale wymiary obrazu bierze się z tego samego wiersza, więc
 * gdyby kiedyś rozjechały się z plikiem (podmieniony upload, import z obcej
 * kopii), klient dostanie kadr, który na pewno pokrywa krążek.
 */
export function toPortraitAssetView(asset: PortraitAssetRow): PortraitAssetView {
  return {
    id: asset.id,
    name: asset.name,
    url: asset.url,
    width: asset.width,
    height: asset.height,
    crop: clampPortraitCrop(
      { x: asset.cropX, y: asset.cropY, zoom: asset.cropZoom },
      { width: asset.width, height: asset.height },
    ),
  };
}
