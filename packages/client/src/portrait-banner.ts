import type { CSSProperties } from 'react';
import type { PortraitBannerPlacement } from '@vtt/shared';

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
