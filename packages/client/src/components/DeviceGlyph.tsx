import type { CSSProperties } from 'react';
import type { TokenGlyph } from '@vtt/shared';

/**
 * Ikona urządzenia na krążku — tak, jak figura wygląda potem na mapie (28.10).
 *
 * Maska CSS jak w `HudIcon`, a nie `<img>`: sylwetka w pliku jest biała, więc
 * kolor bierze się z motywu. Krążek ma grafit podstawy figury, żeby kafelek
 * w „Grafikach” zapowiadał żeton, a nie ikonę z menu.
 */
export function DeviceGlyph({ glyph }: { glyph: TokenGlyph }) {
  const style = { '--device-glyph': `url("/icons/devices/${glyph}.svg")` } as CSSProperties;
  return (
    <span className="device-glyph" aria-hidden>
      <span className="device-glyph-mark" style={style} />
    </span>
  );
}
