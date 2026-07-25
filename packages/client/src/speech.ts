import type { ChatMessageView, SpeechRevealPoint } from '@vtt/shared';
import { SPEECH_AUDIO_TIMEOUT_MS } from '@vtt/shared';
import { useSpeechStore } from './stores/speechStore.js';
import { useChatStore } from './stores/chatStore.js';

/**
 * Playback of bot speech, and the writing-out of its text (stage 12).
 *
 * The line does not appear on chat when the server sends it — it appears when
 * the NPC starts saying it, and then grows word by word in step with the voice,
 * as if someone at the table were taking it down. The rhythm comes from the
 * server (`speech.reveal`), so a player who muted the audio sees exactly the
 * same pacing as the rest of the table, and nobody reads the punchline before
 * it is spoken.
 *
 * One line at a time: two bots answering in a row speak one after another,
 * never together (the queue below), and the second one's text waits its turn.
 */

interface SpeechJob {
  messageId: number;
  text: string;
  audioUrl: string | null;
  durationMs: number;
  reveal: SpeechRevealPoint[];
  /** Replays skip the reveal animation — the text is already on screen. */
  replay: boolean;
}

const queue: SpeechJob[] = [];
let playing = false;
/** Browsers refuse to play audio before the user has interacted with the page. */
let unlocked = false;

export function unlockAudioOnFirstGesture(): void {
  if (unlocked) return;
  const unlock = () => {
    unlocked = true;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

/** Queues a freshly delivered bot line (never history — that shows at once). */
export function speakMessage(message: ChatMessageView): void {
  const speech = message.speech;
  if (!speech) return;
  queue.push({
    messageId: message.id,
    text: message.text,
    audioUrl: speech.audioUrl,
    durationMs: speech.durationMs,
    reveal: speech.reveal,
    replay: false,
  });
  void drain();
}

/** Speaker icon on a delivered line: play the audio again, no re-writing. */
export function replayMessage(message: ChatMessageView): void {
  const speech = message.speech;
  if (!speech?.audioUrl) return;
  queue.push({
    messageId: message.id,
    text: message.text,
    audioUrl: speech.audioUrl,
    durationMs: speech.durationMs,
    reveal: speech.reveal,
    replay: true,
  });
  void drain();
}

/** Plays one preview clip (bot editor) outside the chat queue. */
export async function playPreview(audioUrl: string): Promise<void> {
  const audio = new Audio(audioUrl);
  audio.volume = useSpeechStore.getState().volume;
  try {
    await audio.play();
  } catch {
    // Autoplay blocked — the GM clicked, so this practically cannot happen.
  }
}

async function drain(): Promise<void> {
  if (playing) return;
  playing = true;
  try {
    let job = queue.shift();
    while (job) {
      await runJob(job);
      job = queue.shift();
    }
  } finally {
    playing = false;
  }
}

async function runJob(job: SpeechJob): Promise<void> {
  const store = useSpeechStore.getState();
  const audible = !store.muted && !!job.audioUrl && unlocked;
  const audio = audible ? await prepareAudio(job.audioUrl!, store.volume) : null;

  if (!job.replay) {
    // The line joins the feed exactly when it starts being spoken.
    useChatStore.getState().revealMessage(job.messageId);
    useSpeechStore.getState().startReveal(job.messageId);
  }

  const startedAt = performance.now();
  if (audio) {
    try {
      await audio.play();
    } catch {
      // Blocked mid-session (tab policy changed): fall back to silent pacing.
    }
  }

  if (job.replay) {
    await waitFor(job.durationMs, audio);
    return;
  }

  await animateReveal(job, audio, startedAt);
  useSpeechStore.getState().finishReveal(job.messageId);
}

/**
 * Loads the clip and waits until it can play. A clip that never becomes
 * playable must not keep a chat line invisible, hence the timeout.
 */
async function prepareAudio(url: string, volume: number): Promise<HTMLAudioElement | null> {
  const audio = new Audio(url);
  audio.volume = volume;
  audio.preload = 'auto';
  return new Promise((resolve) => {
    const done = (value: HTMLAudioElement | null) => {
      audio.removeEventListener('canplaythrough', onReady);
      audio.removeEventListener('error', onError);
      window.clearTimeout(guard);
      resolve(value);
    };
    const onReady = () => done(audio);
    const onError = () => done(null);
    const guard = window.setTimeout(() => done(null), SPEECH_AUDIO_TIMEOUT_MS);
    audio.addEventListener('canplaythrough', onReady, { once: true });
    audio.addEventListener('error', onError, { once: true });
    audio.load();
  });
}

/**
 * Writes the text out. The clock is the audio itself when it plays (so text and
 * voice cannot drift apart), and `performance.now()` when it does not.
 */
function animateReveal(
  job: SpeechJob,
  audio: HTMLAudioElement | null,
  startedAt: number,
): Promise<void> {
  return new Promise((resolve) => {
    const setChars = useSpeechStore.getState().setRevealed;
    let frame = 0;

    const step = () => {
      const elapsed =
        audio && !audio.paused ? audio.currentTime * 1000 : performance.now() - startedAt;
      setChars(job.messageId, charsAt(job.reveal, elapsed, job.text.length));
      const finished = audio ? audio.ended : elapsed >= job.durationMs;
      if (finished || elapsed > job.durationMs + SPEECH_AUDIO_TIMEOUT_MS) {
        setChars(job.messageId, job.text.length);
        window.cancelAnimationFrame(frame);
        resolve();
        return;
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
  });
}

async function waitFor(durationMs: number, audio: HTMLAudioElement | null): Promise<void> {
  if (!audio) return;
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    audio.addEventListener('ended', done, { once: true });
    window.setTimeout(done, durationMs + SPEECH_AUDIO_TIMEOUT_MS);
  });
}

/** How many leading characters are visible at `elapsed` ms. */
export function charsAt(reveal: SpeechRevealPoint[], elapsed: number, fullLength: number): number {
  if (reveal.length === 0) return fullLength;
  let chars = 0;
  for (const point of reveal) {
    if (point.ms > elapsed) break;
    chars = point.chars;
  }
  return Math.min(chars, fullLength);
}
