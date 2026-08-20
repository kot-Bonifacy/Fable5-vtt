/**
 * Ikony interfejsu spoza paska mapy (etap 27e).
 *
 * Do 27e te dwa miejsca rysowały emoji — 📰 i 🔌. Na Windowsie oba mają
 * **domyślną prezentację tekstową**, więc Segoe UI Symbol podaje je jako płaski,
 * jednobarwny znak, w dodatku nie do zabarwienia: emoji nie przyjmuje
 * `currentColor`, więc w trybie dziennym zostawało szarą plamą na papierze.
 *
 * Zamiennik to sylwetki z game-icons.net (CC BY 3.0, Delapouite) wklejone tutaj
 * jako ścieżki. Wersje plikowe tych samych ikon leżą w `public/icons/` — używa
 * ich renderer mapy, który potrzebuje URL-a, a nie komponentu Reacta. Atrybucja:
 * `public/icons/ATTRIBUTION.md`.
 *
 * Ikony paska narzędzi mapy mieszkają osobno, w `MapIcons.tsx`: tamte są rysowane
 * kreską (`stroke`) pod ciemne tło nad cudzą grafiką, te są pełnymi sylwetkami
 * dopasowanymi do wysokości linii tekstu.
 */

interface IconProps {
  /** Bok kwadratu w px. Domyślnie mniej więcej wysokość wielkiej litery obok. */
  size?: number;
}

function Glyph({ size = 15, d }: IconProps & { d: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
      focusable="false"
      // Znak stoi w linii tekstu, więc opada razem z nią zamiast wisieć na linii
      // bazowej; `flex: none` chroni go przed ściśnięciem w wierszu flexowym.
      style={{ verticalAlign: '-0.12em', flex: 'none' }}
    >
      <path d={d} />
    </svg>
  );
}

/** Gazeta — screamsheet (etap 24c) w liście handoutów i na czacie. */
export function IconNewspaper(props: IconProps) {
  return <Glyph {...props} d={NEWSPAPER} />;
}

/** Wtyk jacka — punkt dostępu do Sieci (etap 26b). */
export function IconJackPlug(props: IconProps) {
  return <Glyph {...props} d={JACK_PLUG} />;
}

const NEWSPAPER =
  'M41 66.91V415.8c86.5 1 147.5 14.8 206 29.3V141.4c-45.3-30.1-90.4-58.75-206-74.49zm430 0C355.4 82.65 310.3 111.3 265 141.4v303.7c58.5-14.5 119.5-28.3 206-29.3zm-20.9 26.6l.8 66.99c-59.4 17.6-114.5 37.9-168.9 56-.4-20.9-.7-41.7-1.1-62.6 52.8-29.2 111.2-48.1 169.2-60.39zM69.01 105.3C129.8 119.4 184.1 136 226.1 150.1l.2 19c-41.6-13.9-101.3-32.3-161.35-46.3zm.12 46.6l35.97 6.5-3.2 17.8-35.97-6.5zm54.17 11.3l32.5 6.2-3.4 17.6-32.5-6.2zm53.2 10.5l49.6 9.6-3.4 17.6-49.6-9.6zm263.1 19.9l5.2 17.2-56 16.9-5.2-17.2zm-377.68 4.7C119.2 205 176 212.2 223.8 225l-4.6 17.4c-46-12.4-102.2-19.6-159.38-26.3zM357.1 216l4.8 17.4-71.7 19.8-4.8-17.4zm86.4 21l4.8 17.4-32.8 9.1-4.8-17.4zm-378.3 1.6l49.9 5.2-2 18-49.8-5.4zm76.9 9.8l82.1 12.3-2.6 17.8-82.1-12.3zm248.5 3.7l4.8 17.4L288.5 299l-4.8-17.4zm55.8 22.9l4.6 17.4L348.5 319l-4.6-17.4zm-388.06 6.4c29.84 3.1 61.96 7.5 84.46 13v111L59.2 398c-.33-38.9-.48-77.7-.86-116.6zm104.56 14.7l61.5 7.5-2.2 17.8-61.5-7.5zm161.5 11.8l4.2 17.5-37.8 9.1-4.2-17.5zm129.1 4.1l.4 82.2-78.5 10.2c-.3-23.8-.4-47.7-.7-71.5zM164 334.4l59.8 9.8-3 17.8-59.8-9.8zm271.7 1l-42.8 11.3.3 37.3 42.7-5.6zm-81.4 9.8l3.4 17.6-68.9 13.1-3.4-17.6zm-191.1 29.1l62.6 12.4-3.4 17.6-62.6-12.4zm186.6 6.8l4 17.6-62.5 13.9-4-17.6z';

const JACK_PLUG =
  'M406.089 25l-7.504 22.51 14.764 14.763 22.51-7.503V25zm-29.113 26.354l-9.9 9.9 32.529 32.53 9.9-9.901zM354.349 73.98l-43.842 43.844 32.527 32.528 43.844-43.842zm-56.569 56.57l-32.529 32.528 32.53 32.53 32.527-32.53zm-56.568 33.94l-127.898 127.9-8.885 26.65 37.39 37.39 26.649-8.885 127.9-127.899zm172.22 140.47c-15.712-.182-32.101 3.876-48.947 10.47-38.503 15.071-79.972 43.684-120.955 71.744-40.982 28.06-81.503 55.562-115.634 68.5-17.066 6.469-32.346 9.213-45.063 7.424-12.717-1.79-23.226-7.591-32.74-20.45-2.186-2.954-2.233-6.994.928-14.197 3.16-7.203 9.496-15.948 16.576-23.982 9.554-10.843 20.15-20.342 26.11-25.446L80.932 366.25c-6.525 5.638-17.096 15.26-26.84 26.32C46.334 401.376 39 411.052 34.54 421.22c-4.46 10.166-6.082 22.447 1.084 32.133 11.935 16.13 27.625 25.165 44.701 27.568 17.077 2.403 35.185-1.305 53.95-8.418 37.53-14.226 78.436-42.415 119.423-70.479 40.988-28.063 82.028-56.008 117.348-69.834 17.66-6.912 33.746-10.223 47.43-8.962 13.683 1.26 25.137 6.61 35.58 18.666 10.647 12.29 11.662 30.245 5.558 52.644-6.103 22.4-19.359 47.936-34.41 71.668-6.132 9.67-12.54 19.006-18.865 27.797h22.037a567.751 567.751 0 0 0 12.027-18.156c15.598-24.593 29.667-51.22 36.577-76.576 6.91-25.358 6.628-50.753-9.319-69.163-13.168-15.201-29.804-23.17-47.535-24.802a83.568 83.568 0 0 0-6.693-.344zM94.135 334.198l-9.9 9.9 32.527 32.528 9.9-9.9z';
