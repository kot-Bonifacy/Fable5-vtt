/**
 * Icons of the map toolbar (stage 17a).
 *
 * Drawn by hand rather than pulled from an icon font: the toolbar sits on top
 * of the canvas, so the glyphs have to inherit `currentColor` (state is shown
 * by colour, not by a box around the button) and carry their own drop shadow
 * to stay legible over a bright map. Emoji could do neither — half of them
 * rendered as flat monochrome shapes with no way to tint them.
 *
 * The visual language follows what virtual tabletops already use for these
 * tools (Foundry maps them onto Font Awesome: ruler, cloud-fog, thumbtack,
 * eye / eye-slash, rotate-left), so the toolbar reads without a manual — but
 * the paths themselves are ours, which keeps the public repo free of any
 * third-party icon licence.
 */

interface IconProps {
  /** Square size in px; the toolbar leaves the hit area to the button. */
  size?: number;
}

const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Svg({ size = 21, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg {...BASE} width={size} height={size} aria-hidden focusable="false">
      {children}
    </svg>
  );
}

/**
 * Ruler — the measurement tool. Body and ticks share one rotated group; when
 * only the body was rotated the ticks landed outside it and the icon read as
 * a bare rhombus.
 */
export function IconRuler(props: IconProps) {
  return (
    <Svg {...props}>
      <g transform="rotate(-45 12 12)">
        <rect x="1.2" y="9" width="21.6" height="6" rx="1.4" />
        <path d="M5.6 9v2.6M9.2 9v3.4M12.8 9v2.6M16.4 9v3.4M20 9v2.6" />
      </g>
    </Svg>
  );
}

/** Eye — the measurement is visible to everyone. */
export function IconEye(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.6" />
    </Svg>
  );
}

/** Crossed-out eye — private measurement, GM only. */
export function IconEyeOff(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5l16 14" />
      <path d="M9.6 6.4A9.7 9.7 0 0 1 12 6c6.2 0 10 6 10 6a17 17 0 0 1-3.2 3.7" />
      <path d="M6.6 8.2A16.8 16.8 0 0 0 2 12s3.8 6 10 6a9.6 9.6 0 0 0 3.5-.65" />
      <path d="M10.2 10.3a2.6 2.6 0 0 0 3.5 3.5" />
    </Svg>
  );
}

/** Cloud over drifting bands — the fog painting tool. */
export function IconFog(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 12.5a3.5 3.5 0 0 1 .6-6.95 4.7 4.7 0 0 1 9 .95 3 3 0 0 1 .4 6H6.5Z" />
      <path d="M4 16.5h9M16 16.5h4M7 20h10" />
    </Svg>
  );
}

/** Full moon — fog is switched on for this scene (the map sleeps in the dark). */
export function IconMoon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 13.4A8.2 8.2 0 1 1 10.6 4a6.4 6.4 0 0 0 9.4 9.4Z" />
    </Svg>
  );
}

/** Sun — fog is off, the whole scene is lit. */
export function IconSun(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6" />
    </Svg>
  );
}

/**
 * Pushpin — a GM note on the map.
 *
 * This one and the brush stay emoji on purpose: their colour glyphs simply
 * look better than a two-colour line drawing at this size. The trade-off is
 * that an emoji cannot be tinted, so those two buttons show their armed state
 * with a glow instead of a colour change (see `.map-tool-emoji`).
 */
export function IconPin() {
  // A touch smaller than the brush: the pushpin glyph is drawn edge to edge,
  // so at the same font size it outweighs everything next to it.
  return (
    <span className="map-tool-emoji map-tool-emoji--pin" aria-hidden>
      📌
    </span>
  );
}

/** Plain cloud — the fog brush is covering rather than revealing. */
export function IconCloud(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.8 18a4 4 0 0 1 .5-7.96 5.3 5.3 0 0 1 10.2 1.1A3.5 3.5 0 0 1 17.2 18H6.8Z" />
    </Svg>
  );
}

/** Brush — freehand fog painting. Emoji for the same reason as {@link IconPin}. */
export function IconBrush() {
  return (
    <span className="map-tool-emoji" aria-hidden>
      🖌
    </span>
  );
}

/** Dashed rectangle — the fog rectangle tool. */
export function IconRect(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M10.5 4h3M10.5 20h3M4 10.5v3M20 10.5v3" opacity="0.45" />
    </Svg>
  );
}

/** Arrow curling back — undo the last painted shape. */
export function IconUndo(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8.5h8.5a5.5 5.5 0 1 1 0 11H7" />
      <path d="M7.5 5L4 8.5 7.5 12" />
    </Svg>
  );
}

/** Map frame with a sun inside — reveal the whole scene. */
export function IconRevealAll(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 6.8v1.2M12 16v1.2M6.6 12h1.2M16.2 12h1.2" />
    </Svg>
  );
}

/** Map frame packed with fog bands — cover the whole scene. */
export function IconCoverAll(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" fill="currentColor" opacity="0.22" />
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M6.5 9h11M6.5 12h11M6.5 15h7" />
    </Svg>
  );
}

/** Concentric rings — the weapon range overlay from stage 16. */
export function IconRangeRings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </Svg>
  );
}
