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
import type { DiceSkinId, RollResult, RollToss } from '@vtt/shared';
import { DEFAULT_DICE_SKIN } from '@vtt/shared';
import type DiceBoxClass from '@3d-dice/dice-box-threejs';
import { CRIT_COLORSET, DICE_SKINS, FUMBLE_COLORSET, type DiceColorset } from './dice-skins.js';
import { useSettingsStore } from './stores/settingsStore.js';

/** Die sizes the library can render — anything else is skipped. */
const RENDERABLE_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);

const OVERLAY_ID = 'dice-overlay';
/** Dice linger after settling until just past the chat-card reveal (~2.5 s). */
const FADE_OUT_DELAY_MS = 3200;
/**
 * Beat between the first wave settling and the crit/fumble die rolling in
 * (stage 27d). Long enough that the table reads the natural 10 before the
 * extra die lands on it, short enough that nobody reaches for the mouse.
 */
const EXTRA_DIE_DELAY_MS = 550;

/**
 * Builds the predetermined-outcome notation for a server roll: dice groups
 * joined with `+`, then `@` and every die value in spawn order. The cup's
 * shake strength maps to the library's `!` toss boost. Returns null when the
 * roll contains no renderable dice.
 *
 * The crit/fumble die is **not** here: since stage 27d it rolls as its own
 * wave, after this one settles, in a colour of its own (`extraNotation`).
 */
export function toAnimationNotation(roll: RollResult): string | null {
  const groups: string[] = [];
  const values: number[] = [];
  for (const term of roll.terms) {
    if (term.kind !== 'dice' || !RENDERABLE_SIDES.has(term.sides)) continue;
    groups.push(`${term.count}d${term.sides}`);
    values.push(...term.rolls);
  }
  if (groups.length === 0) return null;
  const boost = '!'.repeat(Math.min(Math.max(roll.tossStrength ?? 0, 0), 3));
  return `${boost}${groups.join('+')}@${values.join(',')}`;
}

/** The crit/fumble die of a check, thrown as the second wave. */
export function extraNotation(roll: RollResult): string | null {
  return roll.critical ? `1d10@${roll.critical.extraRoll}` : null;
}

interface DiceJob {
  notation: string;
  fun: boolean;
  /** Cup release direction + point — dice continue the hand's motion. */
  toss: RollToss | undefined;
  /** Shake strength 0–3 scaling the directed throw's speed. */
  strength: number;
  /** Which dice are tumbling: the roller's skin, not the viewer's. */
  skin: DiceSkinId;
  /** Second wave: the crit/fumble die, in its own colour. */
  extra?: { notation: string; type: 'crit' | 'fumble' };
  resolve: (played: boolean) => void;
}

/** Colour set currently loaded into the box — switching costs a theme reload. */
let activeColorset: string | null = null;

let box: DiceBoxClass | null = null;
let initPromise: Promise<DiceBoxClass | null> | null = null;
let overlay: HTMLDivElement | null = null;
let funBadge: HTMLDivElement | null = null;
let fadeTimer: number | undefined;
/** Roll currently animating on the table (null when settled/cleared). */
let current: DiceJob | null = null;
/** Bumped by every throw — lets a superseded roll detect it lost the table. */
let rollGeneration = 0;

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
      // The box boots in this viewer's own skin; every roll then switches it
      // to the roller's before the dice spawn (stage 27d).
      const own = DICE_SKINS[useSettingsStore.getState().skin] ?? DICE_SKINS[DEFAULT_DICE_SKIN];
      const instance = new DiceBox(`#${OVERLAY_ID}`, {
        assetPath: '/dice/',
        theme_customColorset: own.colorset,
        sounds: true,
        volume: useSettingsStore.getState().diceVolume,
        light_intensity: 0.9,
        shadows: true,
      });
      await instance.initialize();
      installDirectedThrow(instance);
      activeColorset = own.colorset.name;
      box = instance;
      return instance;
    } catch (error) {
      console.warn('3D dice unavailable, falling back to chat cards only', error);
      return null;
    }
  })();
  return initPromise;
}

/**
 * Loads a colour set into the box, skipping the reload when it is already
 * there. `updateConfig` reaches only the theme — the library's own
 * `Object.apply(this, config)` does nothing, so volume is assigned on the
 * instance directly (see `applyVolume`).
 *
 * `loadSounds` afterwards is **not** optional. The box loads exactly one set
 * of dice-hit samples at start-up — the one matching its material — and its
 * collision handler indexes that set without checking. Switch a metal skin
 * onto a box that booted on plastic and every single collision throws
 * `Cannot read properties of undefined (reading 'length')`. `loadSounds`
 * re-derives the material from the freshly loaded theme and fills the gap;
 * it is a no-op once a material has been heard.
 */
async function applyColorset(dice: DiceBoxClass, colorset: DiceColorset): Promise<void> {
  if (activeColorset === colorset.name) return;
  await dice.updateConfig({ theme_customColorset: colorset });
  await dice.loadSounds();
  activeColorset = colorset.name;
}

/** Volume follows the slider live — the box reads it at playback time. */
function applyVolume(dice: DiceBoxClass): void {
  const volume = useSettingsStore.getState().diceVolume;
  dice.volume = volume;
  dice.sounds = volume > 0;
}

/**
 * Plays a roll immediately. No queueing: a new throw sweeps dice still on
 * the table (the superseded roll's promise resolves right away so its chat
 * card is never held back).
 *
 * A check that exploded rolls in **two waves** (stage 27d): the ordinary dice
 * first, then — once they have settled — the crit or fumble die, gold or
 * blood-red. The library keeps one theme for the whole table, so this is the
 * only way to tell that die apart from the rest, and it reads better anyway.
 */
async function play(job: DiceJob): Promise<void> {
  const generation = ++rollGeneration;
  const dice = await ensureBox();
  if (!dice || !overlay) {
    job.resolve(false);
    return;
  }
  if (generation !== rollGeneration) {
    // Swept or superseded while the box was still initializing.
    job.resolve(false);
    return;
  }
  current?.resolve(true);
  current = job;
  window.clearTimeout(fadeTimer);
  overlay.classList.add('dice-overlay--active');
  overlay.classList.toggle('dice-overlay--fun', job.fun);
  let played = true;
  try {
    const skin = DICE_SKINS[job.skin] ?? DICE_SKINS[DEFAULT_DICE_SKIN];
    applyVolume(dice);
    await applyColorset(dice, skin.colorset);
    pendingThrow = job.toss ? { toss: job.toss, strength: job.strength } : null;
    await dice.roll(job.notation);
    if (job.extra && generation === rollGeneration) {
      await new Promise((wait) => window.setTimeout(wait, EXTRA_DIE_DELAY_MS));
      if (generation === rollGeneration) {
        const colorset = job.extra.type === 'crit' ? CRIT_COLORSET : FUMBLE_COLORSET;
        await applyColorset(dice, colorset);
        // `add` throws onto the table instead of sweeping it, so the first
        // wave stays where it landed and the extra die drops among it.
        // No `pendingThrow`: this die falls out of a hand that already threw.
        await dice.add(job.extra.notation);
      }
    }
  } catch (error) {
    console.warn('3D dice roll failed', error);
    played = false;
  }
  // Superseded mid-flight — the newer roll owns the table and the fade.
  if (generation !== rollGeneration) return;
  current = null;
  job.resolve(played);
  fadeTimer = window.setTimeout(() => {
    overlay?.classList.remove('dice-overlay--active', 'dice-overlay--fun');
    // Let the fade-out transition finish before removing the dice.
    window.setTimeout(() => {
      if (current === null) box?.clearDice();
    }, 400);
  }, FADE_OUT_DELAY_MS);
}

function enqueue(job: Omit<DiceJob, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    void play({ ...job, resolve });
  });
}

/**
 * Immediately clears the table — grabbing the cup while dice from the
 * previous roll are still tumbling makes them vanish into the cup. A roll
 * still animating resolves right away so its chat card is never held back.
 */
export function sweepDice(): void {
  rollGeneration++;
  current?.resolve(true);
  current = null;
  window.clearTimeout(fadeTimer);
  overlay?.classList.remove('dice-overlay--active', 'dice-overlay--fun');
  box?.clearDice();
}

/**
 * Plays the 3D animation of a server roll. Call for live `chat:message`
 * broadcasts only — history and resyncs must not replay old rolls. Resolves
 * (true = animation actually played) once the dice have settled.
 *
 * Answers `false` at once when this viewer turned the animation off — that is
 * what makes the chat card appear immediately instead of waiting for dice
 * that will never roll.
 */
export function playRollAnimation(roll: RollResult): Promise<boolean> {
  if (!useSettingsStore.getState().animate) return Promise.resolve(false);
  const notation = toAnimationNotation(roll);
  if (!notation) return Promise.resolve(false);
  const extra = extraNotation(roll);
  return enqueue({
    notation,
    fun: false,
    toss: roll.toss,
    strength: roll.tossStrength ?? 0,
    // Whose dice the table sees: the roller's, stamped by the server. A skin
    // this build does not know falls back to the default rather than failing.
    skin: roll.skin ?? DEFAULT_DICE_SKIN,
    ...(extra && roll.critical ? { extra: { notation: extra, type: roll.critical.type } } : {}),
  });
}

/**
 * Local physics-only toy roll from the dice cup (no roll command active):
 * nothing is sent to the server and no chat card appears.
 */
export function playFunRoll(notation: string, strength: number, toss?: RollToss): Promise<boolean> {
  if (!useSettingsStore.getState().animate) return Promise.resolve(false);
  const boost = '!'.repeat(Math.min(Math.max(strength, 0), 3));
  return enqueue({
    notation: `${boost}${notation}`,
    fun: true,
    toss,
    strength,
    // A toy roll is this browser's own — nobody else sees it, so it uses
    // this viewer's dice rather than anyone else's.
    skin: useSettingsStore.getState().skin,
  });
}

/**
 * Preview throw for the settings window (stage 27d): two dice in the chosen
 * skin, physics only, nothing sent anywhere. Returns false when the viewer
 * has animations turned off — there is then nothing to show and the window
 * says so rather than pretending the click did something.
 */
export function previewSkin(skin: DiceSkinId): Promise<boolean> {
  if (!useSettingsStore.getState().animate) return Promise.resolve(false);
  return enqueue({ notation: '!1d10+1d6', fun: true, toss: undefined, strength: 1, skin });
}
