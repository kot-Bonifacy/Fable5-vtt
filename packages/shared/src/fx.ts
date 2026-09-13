import type { ScenePoint } from './measure.js';
import type { Rect } from './rects.js';

/**
 * Map effects — what the table *sees* when something happens (stage 27i).
 *
 * Core VTT, no game system inside. The server decides that a shot went from A
 * to B and hit; which weapon fired and how loud it was is translated by the
 * system layer (`systems/cpred`) into one of the sounds named here, exactly as
 * stage 27h translated a weapon into a slot picture. That keeps the renderer
 * free of Cyberpunk and the rules free of file names.
 *
 * Nothing here is ever stored, sequenced or replayed on a resync: an effect is
 * pure presentation, like the shared ruler of stage 16. A player who joins two
 * seconds late simply missed the bang.
 */

/** A sound sample the map may play. File names live in the client, not here. */
export type MapFxSound =
  | 'shot-pistol'
  | 'shot-rifle'
  | 'shot-sniper'
  | 'shot-shotgun'
  | 'bowstring'
  | 'swing'
  /** Bare hands — Bijatyka i Sztuki walki mają własny odgłos, nie świst ostrza. */
  | 'punch'
  /** Miotacz ognia: buchnięcie, nie huk strzelby. */
  | 'flame'
  /** Granatnik i wyrzutnia rakiet: odpalenie, nie wystrzał z karabinu. */
  | 'launch'
  /** Kula albo pięść dochodzi do celu — głuche uderzenie w ciało. */
  | 'impact'
  /** Chybiony pocisk odbija się od tego, co stało za figurą. */
  | 'ricochet'
  | 'explosion'
  | 'gas'
  | 'zap'
  /** Magazynek do pistoletu: dwa takty — magazynek i zamek. */
  | 'reload-pistol'
  /** …i do broni długiej: zwolnienie, magazynek, zamek. */
  | 'reload-rifle'
  /** A single footstep (stage 27j) — the only sound the map makes on its own. */
  | 'step';

/** Every sound, for the client's preloader and the settings' audition button. */
export const MAP_FX_SOUNDS: readonly MapFxSound[] = [
  'shot-pistol',
  'shot-rifle',
  'shot-sniper',
  'shot-shotgun',
  'bowstring',
  'swing',
  'punch',
  'flame',
  'launch',
  'impact',
  'ricochet',
  'explosion',
  'gas',
  'zap',
  'reload-pistol',
  'reload-rifle',
  'step',
];

/** How the line between muzzle and target is drawn. */
export type MapFxShotStyle = 'bullet' | 'arrow' | 'flame' | 'rocket' | 'melee';

/** Colour and weight of a number floating off a figure. */
export type MapFxTone = 'damage' | 'heal' | 'miss' | 'crit' | 'note';

/**
 * Rounds drawn as separate tracers. A burst of ten looks like ten lines for
 * about a fifth of a second and then like a smear; the cap is where the eye
 * stops counting, not where the rules stop shooting.
 */
export const MAP_FX_MAX_TRACERS = 8;

/** Longest a floating label may be — a guard, not a style rule. */
export const MAP_FX_TEXT_MAX_LENGTH = 24;

export type MapFxEffect =
  | {
      kind: 'shot';
      style: MapFxShotStyle;
      /** Muzzle; null when the viewer cannot see the shooter. */
      from: ScenePoint | null;
      /** Where it landed; null when the viewer cannot see that end. */
      to: ScenePoint | null;
      hit: boolean;
      /** Rounds that visibly leave the barrel (1 for a single shot). */
      shots: number;
      /**
       * The **muzzle**'s bang; null when the shooter is out of sight.
       *
       * What the round does at the other end — a wet thud or a spark off a
       * wall — is the client's to pick from `hit`, and it plays only when `to`
       * survived the trim. Two sounds, two secrets: you may hear a shot land
       * next to you without ever learning the calibre that fired it.
       */
      sound: MapFxSound | null;
    }
  | {
      kind: 'cone';
      /** Muzzle of the spread; the wedge is drawn from here. */
      from: ScenePoint;
      /** Direction of the axis, degrees clockwise from east. */
      angleDeg: number;
      halfAngleDeg: number;
      rangeM: number;
      sound: MapFxSound | null;
    }
  | { kind: 'blast'; at: ScenePoint; sideM: number; sound: MapFxSound | null }
  | {
      kind: 'cloud';
      at: ScenePoint;
      sideM: number;
      variant: 'gas' | 'smoke';
      sound: MapFxSound | null;
    }
  | { kind: 'zap'; rect: Rect; sound: MapFxSound | null }
  | { kind: 'float'; at: ScenePoint; text: string; tone: MapFxTone }
  | { kind: 'spark'; at: ScenePoint; sound: MapFxSound | null };

/** Server → client. Targeted per socket, never a room broadcast (see below). */
export interface MapFxBroadcast {
  sceneId: string;
  effects: MapFxEffect[];
  /**
   * Chat message this effect belongs to, when it belongs to a roll.
   *
   * A roll's card is held back on the client until the 3D dice have landed
   * (stage 27d), so a bang that fired the moment the packet arrived would go
   * off three seconds before the table learns whether the shot hit. The client
   * queues the batch behind that message instead — and plays it anyway after a
   * guard timeout, because a card that never arrives (a GM's private roll a
   * player is not shown) must not silence the map forever.
   */
  afterMessageId?: number;
}

/**
 * Cuts one effect down to the part a given viewer is allowed to see.
 *
 * This is the whole „a bang must not give away a hidden figure" rule, written
 * once and in pure code so it can be tested without a socket. `sees` answers
 * „is this point observable to that viewer" — the fog, the walls, the darkness
 * and the GM's brush all boil down to that one question, and the caller is the
 * one holding the answer (`concealmentFor` on the server).
 *
 * A shot is the interesting case, because it has two ends and they are two
 * different secrets:
 *
 *  - **muzzle visible, target not** — you see somebody fire into the dark. The
 *    line is cut short (`to: null`), so the flash and the sound stay and the
 *    place they were aimed at does not travel. Direction does leak, and that is
 *    deliberate: a shooter you are looking at is pointing a gun somewhere, and
 *    at the table that is exactly what a player would say out loud.
 *  - **target visible, muzzle not** — the round arrives out of nowhere. Impact,
 *    no flash, and **no sound**: hearing „pistol" would tell you the calibre of
 *    a gun nobody has seen.
 *  - **neither** — nothing at all.
 *
 * An area effect is judged at its centre, exactly as a token is (`concealedFrom`
 * measures at the token's centre): „where a thing is" has to mean one thing
 * across the whole VTT. A blast whose edge licks into view but whose centre is
 * behind a wall is therefore not drawn — the same trade the token list makes,
 * and the same reason: partial answers are how positions leak.
 */
export function trimMapFxForViewer(
  effect: MapFxEffect,
  sees: (point: ScenePoint) => boolean,
  seesMap: (point: ScenePoint) => boolean = sees,
): MapFxEffect | null {
  switch (effect.kind) {
    case 'shot': {
      const from = effect.from && sees(effect.from) ? effect.from : null;
      const to = effect.to && sees(effect.to) ? effect.to : null;
      if (!from && !to) return null;
      if (from === effect.from && to === effect.to) return effect;
      return { ...effect, from, to, sound: from ? effect.sound : null };
    }
    case 'cone':
      return sees(effect.from) ? effect : null;
    case 'blast':
    case 'cloud':
      return seesMap(effect.at) ? effect : null;
    case 'float':
    case 'spark':
      return sees(effect.at) ? effect : null;
    case 'zap': {
      const { x, y, width, height } = effect.rect;
      // A defended area is metres across (stage 26f), so its centre may sit
      // behind the very wall a player is standing at while the near edge is in
      // plain sight. Corners answer for the shape the way the centre answers
      // for a token: one of them in view is enough to draw the whole thing —
      // and the shape is already on the player's screen anyway, because a
      // revealed zone travels with the scene.
      const corners: ScenePoint[] = [
        { x, y },
        { x: x + width, y },
        { x, y: y + height },
        { x: x + width, y: y + height },
        { x: x + width / 2, y: y + height / 2 },
      ];
      return corners.some(seesMap) ? effect : null;
    }
  }
}

/** Trims a whole batch, dropping the effects that leave nothing to draw. */
export function trimMapFxBatch(
  effects: readonly MapFxEffect[],
  sees: (point: ScenePoint) => boolean,
  seesMap: (point: ScenePoint) => boolean = sees,
): MapFxEffect[] {
  const kept: MapFxEffect[] = [];
  for (const effect of effects) {
    const trimmed = trimMapFxForViewer(effect, sees, seesMap);
    if (trimmed) kept.push(trimmed);
  }
  return kept;
}

/** Rounds a shot count down to what the eye can still tell apart. */
export function mapFxTracerCount(shots: number): number {
  if (!Number.isFinite(shots)) return 1;
  return Math.max(1, Math.min(MAP_FX_MAX_TRACERS, Math.round(shots)));
}
