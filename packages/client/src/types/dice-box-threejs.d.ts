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

  export default class DiceBox {
    constructor(selector: string, config?: DiceBoxConfig);
    initialize(): Promise<void>;
    /** Notation like `1d10+2d6@7,3,5` — values after `@` force the outcome. */
    roll(notation: string): Promise<unknown>;
    clearDice(): void;
  }
}
