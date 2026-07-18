/** Minimal typings for @3d-dice/dice-box-threejs (no official types). */
declare module '@3d-dice/dice-box-threejs' {
  export interface DiceBoxConfig {
    assetPath?: string;
    framerate?: number;
    sounds?: boolean;
    volume?: number;
    color_spotlight?: number;
    shadows?: boolean;
    theme_surface?: string;
    sound_dieMaterial?: string;
    theme_customColorset?: {
      background?: string;
      foreground?: string;
      outline?: string;
      texture?: string;
      material?: string;
    } | null;
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
    clearDice(): void;

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
