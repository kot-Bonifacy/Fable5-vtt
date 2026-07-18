/**
 * 3D dice visualization (@3d-dice/dice-box-threejs). The dice NEVER decide
 * anything — real rolls are computed on the server and the animation replays
 * their results via the library's predetermined-outcome notation
 * (`1d10+2d6@7,3,5`). "Fun" rolls (dice cup with no roll command) are local
 * physics-only toys: no forced result, nothing sent anywhere.
 *
 * Degrades gracefully: when WebGL/init fails, rolls simply show as chat
 * cards without an animation.
 */
import type { RollResult, RollToss } from '@vtt/shared';
import type DiceBoxClass from '@3d-dice/dice-box-threejs';

/** Die sizes the library can render — anything else is skipped. */
const RENDERABLE_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);

const OVERLAY_ID = 'dice-overlay';
/** Dice linger after settling until just past the chat-card reveal (~2.5 s). */
const FADE_OUT_DELAY_MS = 3200;

/**
 * Builds the predetermined-outcome notation for a server roll: dice groups
 * joined with `+`, then `@` and every die value in spawn order. The
 * crit/fumble extra d10 is appended as its own group; the cup's shake
 * strength maps to the library's `!` toss boost. Returns null when the roll
 * contains no renderable dice.
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
  const boost = '!'.repeat(Math.min(Math.max(roll.tossStrength ?? 0, 0), 3));
  return `${boost}${groups.join('+')}@${values.join(',')}`;
}

interface DiceJob {
  notation: string;
  fun: boolean;
  /** Cup release direction + point — dice continue the hand's motion. */
  toss: RollToss | undefined;
  /** Shake strength 0–3 scaling the directed throw's speed. */
  strength: number;
  resolve: (played: boolean) => void;
}

let box: DiceBoxClass | null = null;
let initPromise: Promise<DiceBoxClass | null> | null = null;
let overlay: HTMLDivElement | null = null;
let funBadge: HTMLDivElement | null = null;
let fadeTimer: number | undefined;
const queue: DiceJob[] = [];
let playing = false;

interface PendingThrow {
  toss: RollToss;
  strength: number;
}

/** Consumed by the patched `startClickThrow` on the very next `roll()`. */
let pendingThrow: PendingThrow | null = null;

/**
 * Patches the instance's `startClickThrow` so a queued cup throw continues
 * the hand's motion: dice spawn at the release point and fly along the
 * gesture's direction, faster for stronger shakes. Without a pending throw
 * the library's random toss runs unchanged.
 */
function installDirectedThrow(dice: DiceBoxClass): void {
  const randomThrow = dice.startClickThrow.bind(dice);
  dice.startClickThrow = (notation: string) => {
    const pending = pendingThrow;
    pendingThrow = null;
    if (!pending) return randomThrow(notation);
    if (dice.rolling) {
      dice.clearDice();
      dice.rolling = false;
    }

    const { display } = dice;
    const { dirX, dirY, originX, originY } = pending.toss;
    // Shake strength 0–3 → throw speed. The library's own throws use
    // |vector| ≈ 0–1.5 × the half-diagonal; this range sits inside it.
    const reach =
      Math.hypot(display.currentWidth, display.currentHeight) * (0.35 + 0.45 * pending.strength);
    // Screen y grows downward, world y upward.
    const throwVector = { x: dirX * reach, y: -dirY * reach };
    const magnitude = reach + 100;
    const boost = (Math.random() * 0.8 + 2.6) * magnitude * dice.strength;
    const vectors = dice.getNotationVectors(notation, throwVector, boost, magnitude);
    if (!vectors) return vectors;

    // Spawn at the release point (clamped inside the walls at ±0.93),
    // trailing dice staggered behind it as if pouring out of the cup.
    const clampX = (x: number) =>
      Math.min(Math.max(x, -0.85 * display.containerWidth), 0.85 * display.containerWidth);
    const clampY = (y: number) =>
      Math.min(Math.max(y, -0.85 * display.containerHeight), 0.85 * display.containerHeight);
    const origin = {
      x: clampX((originX * 2 - 1) * display.containerWidth),
      y: clampY((1 - originY * 2) * display.containerHeight),
    };
    const back = { x: -dirX, y: dirY };
    const spacing = display.scale * 0.9;
    vectors.vectors.forEach((die, index) => {
      const lateral = (Math.random() - 0.5) * spacing;
      die.pos.x = clampX(origin.x + back.x * spacing * index - back.y * lateral);
      die.pos.y = clampY(origin.y + back.y * spacing * index + back.x * lateral);
      // die.pos.z stays as rolled by the library (200–400): a hand-height drop.
    });
    return vectors;
  };
}

function ensureOverlay(): HTMLDivElement {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'dice-overlay';
  funBadge = document.createElement('div');
  funBadge.className = 'dice-overlay-fun-badge';
  funBadge.textContent = 'Rzut na niby — bez znaczenia dla gry';
  overlay.appendChild(funBadge);
  document.body.appendChild(overlay);
  return overlay;
}

async function ensureBox(): Promise<DiceBoxClass | null> {
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
      installDirectedThrow(instance);
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
  const job = queue.shift();
  if (!job) {
    playing = false;
    return;
  }
  playing = true;
  const dice = await ensureBox();
  if (!dice || !overlay) {
    job.resolve(false);
    for (const skipped of queue.splice(0)) skipped.resolve(false);
    playing = false;
    return;
  }
  window.clearTimeout(fadeTimer);
  overlay.classList.add('dice-overlay--active');
  overlay.classList.toggle('dice-overlay--fun', job.fun);
  let played = true;
  try {
    pendingThrow = job.toss ? { toss: job.toss, strength: job.strength } : null;
    await dice.roll(job.notation);
  } catch (error) {
    console.warn('3D dice roll failed', error);
    played = false;
  }
  job.resolve(played);
  if (queue.length > 0) {
    void playNext();
    return;
  }
  playing = false;
  fadeTimer = window.setTimeout(() => {
    overlay?.classList.remove('dice-overlay--active', 'dice-overlay--fun');
    // Let the fade-out transition finish before removing the dice.
    window.setTimeout(() => {
      if (!playing) box?.clearDice();
    }, 400);
  }, FADE_OUT_DELAY_MS);
}

function enqueue(
  notation: string,
  fun: boolean,
  toss: RollToss | undefined,
  strength: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ notation, fun, toss, strength, resolve });
    if (!playing) void playNext();
  });
}

/**
 * Queues the 3D animation of a server roll. Call for live `chat:message`
 * broadcasts only — history and resyncs must not replay old rolls. Resolves
 * (true = animation actually played) once the dice have settled.
 */
export function playRollAnimation(roll: RollResult): Promise<boolean> {
  const notation = toAnimationNotation(roll);
  if (!notation) return Promise.resolve(false);
  return enqueue(notation, false, roll.toss, roll.tossStrength ?? 0);
}

/**
 * Local physics-only toy roll from the dice cup (no roll command active):
 * nothing is sent to the server and no chat card appears.
 */
export function playFunRoll(notation: string, strength: number, toss?: RollToss): Promise<boolean> {
  const boost = '!'.repeat(Math.min(Math.max(strength, 0), 3));
  return enqueue(`${boost}${notation}`, true, toss, strength);
}
