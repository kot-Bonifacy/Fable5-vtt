/**
 * Icons of the map toolbar (stage 17a).
 *
 * Mostly drawn by hand rather than pulled from an icon font: the toolbar sits
 * on top of the canvas, so a glyph has to inherit `currentColor` (state is
 * shown by colour, not by a box around the button) and carry its own drop
 * shadow to stay legible over a bright map. Emoji do neither — several of them
 * render as flat monochrome shapes that cannot be tinted.
 *
 * The pushpin and the brush are the exception: their colour glyphs simply look
 * better than a two-colour line drawing, so those two show „armed" with a glow
 * instead of a colour change.
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

/** Sun — the fog brush is revealing rather than covering. */
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
  return (
    <span className="map-tool-emoji" aria-hidden>
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

/* --- stage 17b: drawing tools --- */

/** Nib on a slanted body — the freehand pencil, and the drawing tool itself. */
export function IconPencil(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20l1.1-4 10-10 2.9 2.9-10 10L4 20Z" />
      <path d="M15.1 6l2.2-2.2a1.5 1.5 0 0 1 2.1 0l.8.8a1.5 1.5 0 0 1 0 2.1L18 8.9" />
      <path d="M5.1 16L8 18.9" opacity="0.5" />
    </Svg>
  );
}

/** A segment with its two endpoints — the straight line tool. */
export function IconLine(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 17.5 17.5 6.5" />
      <circle cx="5.6" cy="18.4" r="1.9" />
      <circle cx="18.4" cy="5.6" r="1.9" />
    </Svg>
  );
}

/** Solid rectangle outline — distinct from the fog's dashed one on purpose. */
export function IconRectSolid(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.6" />
    </Svg>
  );
}

/** Ellipse — the oval tool. */
export function IconEllipse(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="12" cy="12" rx="8.6" ry="6.2" />
    </Svg>
  );
}

/** A serif „T" — the text tool. */
export function IconText(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 6.5h14M12 6.5V18" />
      <path d="M9 18h6" />
    </Svg>
  );
}

/** Slanted eraser over the line it is wiping. */
export function IconEraser(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8.4 19.5 4 15.1a1.6 1.6 0 0 1 0-2.3l7.6-7.6a1.6 1.6 0 0 1 2.3 0l4.4 4.4a1.6 1.6 0 0 1 0 2.3l-7.6 7.6H8.4Z" />
      <path d="M8.6 8.2 15.8 15.4" opacity="0.5" />
      <path d="M11 19.5h9" />
    </Svg>
  );
}

/** Half-shaded square — the fill toggle for rectangles and ellipses. */
export function IconFill(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4.6 14.5 14.5 4.6M8.2 19.4 19.4 8.2M13.4 20 20 13.4" opacity="0.75" />
    </Svg>
  );
}

/** Waste bin — clearing drawings off the scene. */
export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
      <path d="M6.5 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.5" />
      <path d="M10.4 10v6.6M13.6 10v6.6" opacity="0.6" />
    </Svg>
  );
}

/** Bin with a sweeping arc — clearing *everything*, the GM's big hammer. */
export function IconTrashAll(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 8.5h11M8.5 8.5V7a1.5 1.5 0 0 1 1.5-1.5h1.5A1.5 1.5 0 0 1 13 7v1.5" />
      <path d="M6 8.5 6.8 19a1.6 1.6 0 0 0 1.6 1.5h3.2A1.6 1.6 0 0 0 13.2 19L14 8.5" />
      <path d="M17 5.5a7 7 0 0 1 0 13" opacity="0.6" />
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

/** Brickwork — the wall tool (stage 18a). */
export function IconWall(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 6.5h17v11h-17z" />
      <path d="M3.5 12h17M9 6.5V12M15 12v5.5" />
    </Svg>
  );
}

/** A door leaf with its handle — the door kind, and the toggle. */
export function IconDoor(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 3.5h11v17h-11z" />
      <circle cx="14.5" cy="12" r="1" fill="currentColor" />
    </Svg>
  );
}

/** A pane with a cross bar — the window kind (never blocks sight). */
export function IconWindow(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 5.5h15v13h-15z" />
      <path d="M12 5.5v13M4.5 12h15" opacity="0.6" />
    </Svg>
  );
}

/** A bulb — the light tool, and one lamp on the map (stage 18b). */
export function IconLamp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3a6 6 0 0 0-3.4 10.9c.6.4.9 1 .9 1.7v.4h5v-.4c0-.7.3-1.3.9-1.7A6 6 0 0 0 12 3Z" />
      <path d="M9.5 19h5M10.5 21.5h3" />
    </Svg>
  );
}

/**
 * A bulb inside four walls — „light this room" (stage 18c). The room is what
 * distinguishes it from the plain lamp next to it in the toolbar: the button
 * places the same lamp, but lets the walls decide how far it reaches.
 */
export function IconRoomLight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 4.5h17v15h-17z" />
      <path d="M12 8.5a3 3 0 0 0-1.7 5.5c.3.2.45.5.45.85v.15h2.5v-.15c0-.35.15-.65.45-.85A3 3 0 0 0 12 8.5Z" />
    </Svg>
  );
}

/**
 * A moon over a rooftop — „dark scene". A crescent alone reads as „night mode"
 * for the interface, which is a different switch entirely.
 */
export function IconDarkScene(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15.5 3.2a6.4 6.4 0 1 0 5.3 9.6 7 7 0 0 1-5.3-9.6Z" />
      <path d="M2.5 20.5h9M4 20.5v-4l3.5-2.6L11 16.5v4" opacity="0.7" />
    </Svg>
  );
}

/** A flickering flame — the lamp's „migotanie" toggle. */
export function IconFlicker(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3c2.5 3 4.5 5 4.5 8a4.5 4.5 0 0 1-9 0c0-1.6.8-2.9 2-4.3" />
      <path
        d="M12 19.5c1.4 0 2.2-1 2.2-2.1 0-1.3-1.1-2-2.2-3.4-1.1 1.4-2.2 2.1-2.2 3.4 0 1.1.8 2.1 2.2 2.1Z"
        opacity="0.6"
      />
    </Svg>
  );
}

/** Points snapping to a lattice — the wall snap toggle. */
export function IconSnap(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9h16M4 15h16M9 4v16M15 4v16" opacity="0.5" />
      <circle cx="9" cy="9" r="2" fill="currentColor" />
      <circle cx="15" cy="15" r="2" fill="currentColor" />
    </Svg>
  );
}
