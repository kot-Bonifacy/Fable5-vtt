/**
 * Sylwetka broni albo akcji na kaflu panelu postaci (etap 27h).
 *
 * Plik SVG rysowany **maską**, nie `<img>`: ikona ma się barwić kolorem
 * tekstu kafla, a ten zmienia się cztery razy — inaczej wygląda slot zwykły,
 * uzbrojony, odmówiony i podświetlony kursorem. `<img>` byłby czterema
 * kopiami tego samego pliku w czterech barwach, `mask` jest jednym plikiem
 * i jednym `currentColor`.
 *
 * Ikony nazywa `shared` (`CpredSlotIcon`) — panel dostaje nazwę *rzeczy*, nie
 * ścieżkę do pliku, więc podmiana sylwetki nigdy nie jest zmianą w regułach.
 * Same pliki: `public/icons/hud/`, game-icons.net na CC BY 3.0, atrybucja
 * w `public/icons/ATTRIBUTION.md`.
 */

import type { CSSProperties } from 'react';

interface HudIconProps {
  /** Nazwa pliku bez rozszerzenia — `CpredSlotIcon` albo ikona statystyki. */
  name: string;
  /** Dodatkowa klasa; sama `.hud-icon` niesie maskę i rozmiar. */
  className?: string;
}

export function HudIcon({ name, className }: HudIconProps) {
  // Zmienna CSS zamiast `mask-image` wprost: `styles.css` trzyma wtedy całą
  // mechanikę maski (rozmiar, powtarzanie, tło), a komponent podaje sam adres.
  const style = { '--hud-icon': `url("/icons/hud/${name}.svg")` } as CSSProperties;
  return (
    <span className={className ? `hud-icon ${className}` : 'hud-icon'} style={style} aria-hidden />
  );
}
