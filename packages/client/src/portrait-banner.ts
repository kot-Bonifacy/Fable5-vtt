import type { CSSProperties } from 'react';
import type { PortraitBannerPlacement } from '@vtt/shared';
import { PORTRAIT_BANNER_ASPECT, portraitBannerFor } from '@vtt/shared';
import { usePortraitStore } from './stores/portraitStore.js';

/**
 * Ułożenie portretu w banerze jako styl `<img>` w procentach ramki (25.09).
 * Wspólne dla banera w lewym panelu i podglądu w oknie kadru — żeby okno nie
 * obiecywało kadru, którego panel nie narysuje.
 */
export function bannerImageStyle(place: PortraitBannerPlacement): CSSProperties {
  const pct = (value: number) => `${(value * 100).toFixed(3)}%`;
  return {
    width: pct(place.width),
    height: pct(place.height),
    left: pct(place.left),
    top: pct(place.top),
  };
}

/**
 * Styl `<img>` dla portretu w ramce o proporcjach `aspect` (wysokość przez
 * szerokość) — kadr banera właściciela albo przeniesiony kadr żetonu; `null`,
 * gdy portretu nie ma w puli (wtedy zostaje `object-position` z CSS).
 * Czytają go baner lewego panelu i portrety zakładki „Walka" (43a).
 */
export function usePortraitFrameStyle(
  imageUrl: string | null,
  aspect: number = PORTRAIT_BANNER_ASPECT,
): CSSProperties | null {
  const asset = usePortraitStore((s) =>
    imageUrl ? (s.assets.find((a) => a.url === imageUrl) ?? null) : null,
  );
  return asset ? bannerImageStyle(portraitBannerFor(asset, aspect)) : null;
}
