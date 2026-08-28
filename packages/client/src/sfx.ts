import { MAP_FX_SOUNDS, type MapFxSound } from '@vtt/shared';
import { useSettingsStore } from './stores/settingsStore.js';

/**
 * The map's sound layer (stage 27i).
 *
 * The same shape the cup's rattle took in 27d — plain `Audio` elements, no Web
 * Audio graph — because the requirement is the same and it is a small one:
 * play a short sample now, at a volume the user picked, and never let a failure
 * to do so break anything. A gunshot that cannot play because the browser has
 * not seen a click yet is a gunshot nobody misses.
 *
 * Two dials from 27d apply here without being re-invented:
 *
 *  - **the SFX slider** (its own, next to dice and cup — a table that wants
 *    rattling dice and a silent map is a table that exists);
 *  - **„Animacja 3D" off**, which stops the map too. The switch means „nie chcę
 *    przedstawienia", and a bang with no picture is the worst half of one.
 */

/** Sample file per sound. Extensions differ — the packs differ (see ATTRIBUTION). */
const SFX_FILES: Readonly<Record<MapFxSound, string>> = {
  'shot-pistol': '/sfx/shot-pistol.wav',
  'shot-rifle': '/sfx/shot-rifle.wav',
  'shot-sniper': '/sfx/shot-sniper.wav',
  'shot-shotgun': '/sfx/shot-shotgun.wav',
  bowstring: '/sfx/bowstring.wav',
  swing: '/sfx/swing.wav',
  punch: '/sfx/punch.ogg',
  flame: '/sfx/flame.ogg',
  launch: '/sfx/launch.wav',
  impact: '/sfx/impact.wav',
  ricochet: '/sfx/ricochet.ogg',
  explosion: '/sfx/explosion.ogg',
  gas: '/sfx/gas.wav',
  zap: '/sfx/zap.wav',
  'reload-pistol': '/sfx/reload-pistol.wav',
  'reload-rifle': '/sfx/reload-rifle.wav',
  step: '/sfx/step.ogg',
};

/**
 * How loud each sample is *relative to the others*, before the slider.
 *
 * Levelling by ear is what a mixing desk is for, and this project has none —
 * so the numbers below are the honest correction for packs recorded by
 * different people: the gunshots come off a real range and clip, the interface
 * clicks are studio-quiet. Anything a player finds wrong is one number here.
 */
const SFX_GAIN: Readonly<Record<MapFxSound, number>> = {
  'shot-pistol': 0.55,
  'shot-rifle': 0.55,
  'shot-sniper': 0.6,
  'shot-shotgun': 0.6,
  bowstring: 0.7,
  swing: 0.7,
  punch: 0.75,
  flame: 0.7,
  launch: 0.7,
  impact: 0.7,
  ricochet: 0.6,
  explosion: 0.85,
  gas: 0.7,
  zap: 0.75,
  // Obie próbki przeładowania są znormalizowane do 0 dBFS, a magazynek nie jest
  // wystrzałem: schodzą niżej niż broń, którą ładują.
  'reload-pistol': 0.6,
  'reload-rifle': 0.6,
  // Quiet on purpose. A footstep is punctuation, not an event — the stage said
  // „o ile nie zmęczy przy stole", and a step at the volume of a gunshot would.
  step: 0.35,
};

/**
 * A tiny pool per sound, so a burst of five does not fight over one element.
 *
 * `HTMLAudioElement` can only be playing once; restarting it cuts the previous
 * shot off mid-bang, which is exactly what a burst must *not* sound like. Four
 * voices is what `MAP_FX_MAX_TRACERS` needs at the rate the renderer staggers
 * them, and the fifth simply reuses the oldest.
 */
const VOICES_PER_SOUND = 4;

const pools = new Map<MapFxSound, { elements: HTMLAudioElement[]; next: number }>();

function poolFor(sound: MapFxSound): { elements: HTMLAudioElement[]; next: number } {
  let pool = pools.get(sound);
  if (!pool) {
    pool = {
      elements: Array.from({ length: VOICES_PER_SOUND }, () => {
        const audio = new Audio(SFX_FILES[sound]);
        audio.preload = 'auto';
        return audio;
      }),
      next: 0,
    };
    pools.set(sound, pool);
  }
  return pool;
}

/** Is the map allowed to make noise at all right now? */
export function sfxEnabled(): boolean {
  const settings = useSettingsStore.getState();
  return settings.animate && settings.sfxVolume > 0;
}

/**
 * Plays one sample.
 *
 * `pitch` scatters otherwise identical rounds a little — ten shots from the
 * same file in a row read as a loop, and a burst is the one place that happens.
 * `gain` is for the caller who wants a quieter copy of a sound (a shot heard
 * across the map).
 */
export function playFxSound(sound: MapFxSound, options?: { pitch?: number; gain?: number }): void {
  if (!sfxEnabled()) return;
  const volume = useSettingsStore.getState().sfxVolume / 100;
  const pool = poolFor(sound);
  const audio = pool.elements[pool.next % pool.elements.length]!;
  pool.next += 1;
  audio.volume = Math.max(0, Math.min(1, volume * SFX_GAIN[sound] * (options?.gain ?? 1)));
  audio.playbackRate = options?.pitch ?? 1;
  try {
    audio.currentTime = 0;
  } catch {
    // Not loaded yet — `play` starts it from the beginning anyway.
  }
  void audio.play().catch(() => undefined);
}

/**
 * One footstep of a figure walking a planned route (stage 27j).
 *
 * Left and right are the same sample at two pitches rather than two files: the
 * pack has both feet, but a second entry in `MAP_FX_SOUNDS` would put a second
 * „Krok" button in the settings for a difference nobody can name out loud.
 * Alternating is what makes a walk sound like a walk instead of a loop.
 */
let stepFoot = 0;

export function playStepSound(): void {
  if (!useSettingsStore.getState().stepSounds) return;
  stepFoot ^= 1;
  playFxSound('step', { pitch: stepFoot === 0 ? 0.94 : 1.08 });
}

/**
 * Plays one sample **ignoring the „bez animacji" switch** — the audition button
 * in „⚙ Ustawienia", whose whole job is to let somebody hear a sample and tell
 * whether it belongs on the map. Still obeys the slider: auditioning at zero
 * would be a button that lies.
 */
export function auditionFxSound(sound: MapFxSound): void {
  const volume = useSettingsStore.getState().sfxVolume / 100;
  if (volume <= 0) return;
  const audio = poolFor(sound).elements[0]!;
  audio.volume = Math.max(0, Math.min(1, volume * SFX_GAIN[sound]));
  audio.playbackRate = 1;
  try {
    audio.currentTime = 0;
  } catch {
    // see above
  }
  void audio.play().catch(() => undefined);
}

/**
 * Pulls every sample into the browser cache.
 *
 * Called once when a scene opens rather than at module load: the first shot of
 * the evening must not be the one that arrives late, and 400 kB fetched while
 * the map is still drawing costs nobody anything.
 */
export function preloadFxSounds(): void {
  for (const sound of MAP_FX_SOUNDS) poolFor(sound);
}
