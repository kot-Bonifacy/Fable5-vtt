/** Minimal typings for @3d-dice/dice-box-threejs (no official types). */
declare module '@3d-dice/dice-box-threejs' {
  /**
   * A hand-made colour set. `name` is the library's cache key — leave it out
   * and every switch stores a fresh entry under `${Date.now()}`.
   */
  export interface DiceCustomColorset {
    name?: string;
    background?: string | string[];
    foreground?: string;
    outline?: string;
    texture?: string;
    material?: string;
  }

  export interface DiceBoxConfig {
    assetPath?: string;
    framerate?: number;
    sounds?: boolean;
    volume?: number;
    color_spotlight?: number;
    shadows?: boolean;
    theme_surface?: string;
    sound_dieMaterial?: string;
    theme_customColorset?: DiceCustomColorset | null;
    theme_colorset?: string;
    theme_texture?: string;
    theme_material?: string;
    gravity_multiplier?: number;
    light_intensity?: number;
    baseScale?: number;
    strength?: number;
    onRollComplete?: (results: unknown) => void;
  }

  /** One die's spawn parameters inside `NotationVectors` (internal). */
  export interface DiceThrowVector {
    pos: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    angle: { x: number; y: number; z: number };
  }

  /** Parsed notation + computed physics vectors (internal). */
  export interface NotationVectors {
    vectors: DiceThrowVector[];
  }

  export default class DiceBox {
    constructor(selector: string, config?: DiceBoxConfig);
    initialize(): Promise<void>;
    /** Notation like `1d10+2d6@7,3,5` — values after `@` force the outcome. */
    roll(notation: string): Promise<unknown>;
    /**
     * Throws more dice onto a table that already has some — unlike `roll`,
     * which sweeps it first. This is how the crit/fumble die gets its own
     * wave (stage 27d).
     */
    add(notation: string): Promise<unknown>;
    /**
     * Swaps the live theme. Only the four `theme_*` keys take effect: the
     * library's own `Object.apply(this, config)` is a no-op, so volume and
     * sounds have to be assigned on the instance directly.
     */
    updateConfig(config: DiceBoxConfig): Promise<void>;
    /**
     * Re-derives the dice-hit sample set from the current theme and loads it
     * when missing. Must run after every `updateConfig` that changes the
     * material — the collision handler indexes the set without checking.
     */
    loadSounds(): Promise<void>;
    clearDice(): void;
    /** 0–100, read at playback time — assignable live. */
    volume: number;
    sounds: boolean;
    /**
     * Which sample set the dice hits come from (`plastic`, `metal`, …).
     * Owned by the library — `loadSounds` sets it from the theme. Assigning
     * it by hand names a set that may not be loaded, and every collision then
     * throws.
     */
    sound_dieMaterial: string;

    // Internals used to direct the throw along the cup gesture. World frame:
    // origin at screen center, y up; container* are the viewport px sizes,
    // current* half of them; walls sit at ±0.93 × container*.
    rolling: boolean;
    /** Throw force multiplier from config (default 1). */
    strength: number;
    display: {
      currentWidth: number;
      currentHeight: number;
      containerWidth: number;
      containerHeight: number;
      scale: number;
    };
    /** Random-direction throw used by `roll()` — patchable per instance. */
    startClickThrow(notation: string): NotationVectors | null;
    /** Computes spawn/velocity vectors for a given throw direction. */
    getNotationVectors(
      notation: string,
      vector: { x: number; y: number },
      boost: number,
      dist: number,
    ): NotationVectors | null;
  }
}
