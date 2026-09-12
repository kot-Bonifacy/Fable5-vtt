/**
 * Wygląd siatki na mapie (zlecenie MG, 12.09.2026).
 *
 * Siatka nie musi trafiać w mapę co do piksela, ale MG ma **sam zauważyć**
 * rozjazd, zanim aktywuje scenę. Na ciemnej mapie domyślna czarna kreska
 * z kryciem 35% — do tego pod mgłą, którą MG widzi przyciemnioną — praktycznie
 * znika. Dlatego przy otwartym edytorze sceny siatka dostaje obwódkę w kolorze
 * przeciwnym do własnego i pełne krycie: czytelna na każdej mapie. Gracze
 * widzą ją zawsze taką, jaką MG zapisał — ten tryb nie wychodzi poza kartę MG.
 *
 * Czysta funkcja, bo to ona rozstrzyga, jak siatka wygląda; renderer tylko
 * przekłada wynik na `Graphics.stroke`.
 */

export interface GridStroke {
  color: number;
  alpha: number;
  /** Grubość w pikselach świata; brak = kreska jednego piksela ekranu. */
  width?: number;
}

/** Grubość obwódki kontrastowej, w pikselach EKRANU. */
export const GRID_CONTRAST_CASING_PX = 3;

/** Najniższe krycie kreski w trybie kontrastowym — suwak „Krycie" jej nie zgasi. */
export const GRID_CONTRAST_MIN_ALPHA = 0.9;

const GRID_CONTRAST_CASING_ALPHA = 0.75;

/** `#rrggbb` → liczba dla Pixi; cokolwiek innego to czerń, jak domyślna siatka. */
export function parseGridColor(hex: string): number {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex.slice(1), 16) : 0;
}

/**
 * Czy kolor jest jasny. Próg 0,179 luminancji względnej to punkt, w którym
 * czerń i biel dają na tym kolorze ten sam kontrast (WCAG) — powyżej obwódka
 * idzie czarna, poniżej biała.
 */
export function isLightColor(color: number): boolean {
  const channel = (shift: number) => {
    const value = ((color >> shift) & 0xff) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance > 0.179;
}

/**
 * Kreski siatki w kolejności rysowania (pierwsza pod spodem).
 *
 * @param worldPerScreenPx ile pikseli świata przypada na piksel ekranu —
 *   obwódka ma stałą grubość na ekranie, niezależnie od zbliżenia.
 */
export function gridStrokes(
  grid: { color: string; alpha: number },
  contrast: boolean,
  worldPerScreenPx: number,
): GridStroke[] {
  const color = parseGridColor(grid.color);
  if (!contrast) return [{ color, alpha: grid.alpha }];
  return [
    {
      color: isLightColor(color) ? 0x000000 : 0xffffff,
      alpha: GRID_CONTRAST_CASING_ALPHA,
      width: GRID_CONTRAST_CASING_PX * worldPerScreenPx,
    },
    { color, alpha: Math.max(grid.alpha, GRID_CONTRAST_MIN_ALPHA) },
  ];
}
