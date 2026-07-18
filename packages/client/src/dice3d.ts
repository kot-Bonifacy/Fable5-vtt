/**
 * 3D dice visualization (@3d-dice/dice-box-threejs). The dice NEVER decide
 * anything — the server rolls, and the animation replays its results using
 * the library's predetermined-outcome notation (`1d10+2d6@7,3,5`).
 *
 * Degrades gracefully: when WebGL/init fails, rolls simply show as chat
 * cards without an animation.
 */
import type { RollResult } from '@vtt/shared';

/** Die sizes the library can render — anything else is skipped. */
const RENDERABLE_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);

const OVERLAY_ID = 'dice-overlay';
const FADE_OUT_DELAY_MS = 1800;

/**
 * Builds the predetermined-outcome notation for a server roll: dice groups
 * joined with `+`, then `@` and every die value in spawn order. The
 * crit/fumble extra d10 is appended as its own group. Returns null when the
 * roll contains no renderable dice.
 */
export function toAnimationNotation(roll: RollResult): string | null {
  const groups: string[] = [];
  const values: number[] = [];
  for (const term of roll.terms) {
    if (term.kind !== 'dice' || !RENDERABLE_SIDES.has(term.sides)) continue;
    groups.push(`${term.count}d${term.sides}`);
    values.push(...term.rolls);
  }
  if (roll.critical) {
    groups.push('1d10');
    values.push(roll.critical.extraRoll);
  }
  if (groups.length === 0) return null;
  return `${groups.join('+')}@${values.join(',')}`;
}

interface DiceBoxLike {
  initialize(): Promise<void>;
  roll(notation: string): Promise<unknown>;
  clearDice(): void;
}

let box: DiceBoxLike | null = null;
let initPromise: Promise<DiceBoxLike | null> | null = null;
let overlay: HTMLDivElement | null = null;
let fadeTimer: number | undefined;
const queue: string[] = [];
let playing = false;

function ensureOverlay(): HTMLDivElement {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'dice-overlay';
  document.body.appendChild(overlay);
  return overlay;
}

async function ensureBox(): Promise<DiceBoxLike | null> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      ensureOverlay();
      const { default: DiceBox } = await import('@3d-dice/dice-box-threejs');
      const instance = new DiceBox(`#${OVERLAY_ID}`, {
        assetPath: '/dice/',
        theme_customColorset: {
          background: '#a11010',
          foreground: '#f2f2f2',
          outline: 'black',
          texture: 'metal',
          material: 'metal',
        },
        sounds: true,
        volume: 50,
        sound_dieMaterial: 'metal',
        light_intensity: 0.9,
        shadows: true,
      });
      await instance.initialize();
      box = instance;
      return instance;
    } catch (error) {
      console.warn('3D dice unavailable, falling back to chat cards only', error);
      return null;
    }
  })();
  return initPromise;
}

async function playNext(): Promise<void> {
  const notation = queue.shift();
  if (!notation) {
    playing = false;
    return;
  }
  playing = true;
  const dice = await ensureBox();
  if (!dice || !overlay) {
    queue.length = 0;
    playing = false;
    return;
  }
  window.clearTimeout(fadeTimer);
  overlay.classList.add('dice-overlay--active');
  try {
    await dice.roll(notation);
  } catch (error) {
    console.warn('3D dice roll failed', error);
  }
  if (queue.length > 0) {
    void playNext();
    return;
  }
  playing = false;
  fadeTimer = window.setTimeout(() => {
    overlay?.classList.remove('dice-overlay--active');
    // Let the fade-out transition finish before removing the dice.
    window.setTimeout(() => {
      if (!playing) box?.clearDice();
    }, 400);
  }, FADE_OUT_DELAY_MS);
}

/**
 * Queues the 3D animation of a server roll. Call for live `chat:message`
 * broadcasts only — history and resyncs must not replay old rolls.
 */
export function playRollAnimation(roll: RollResult): void {
  const notation = toAnimationNotation(roll);
  if (!notation) return;
  queue.push(notation);
  if (!playing) void playNext();
}
