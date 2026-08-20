import type { MapFxBroadcast, MapFxEffect } from '@vtt/shared';

/**
 * The queue between the socket and the map (stage 27i).
 *
 * A module rather than a store, for the same reason `dice3d.ts` is one: this is
 * not state anybody renders off. Nothing here survives a frame — an effect is
 * handed to the renderer and forgotten. A zustand store would give every
 * subscriber a re-render for a thing that has already happened.
 *
 * Its one real job is **waiting**. A roll's chat card is held back until the
 * 3D dice have landed (stage 27d), and a shot that went off the moment its
 * packet arrived would tell the table the verdict some five seconds before the
 * card that carries it. So a batch tagged with `afterMessageId` sits here until
 * that card is revealed.
 *
 * The two events race, and both orders happen:
 *
 *  - the card is **revealed first** (no animation, or a very fast one) — the id
 *    goes into `released`, and the batch plays the moment it lands;
 *  - the batch arrives first — it waits under that id until the reveal, or
 *    until the guard timer gives up on a card that is never coming.
 */

type Sink = (effects: readonly MapFxEffect[]) => void;

/**
 * Longest a batch waits for its card.
 *
 * A normal roll reveals at about five and a half seconds (the dice, then the
 * 2.5 s the table gets to read them). Eight is comfortably past that and still
 * short enough that a card lost on the way does not leave the map silent for
 * long enough to be confusing.
 */
const CARD_WAIT_MS = 8000;

/**
 * Released ids we remember. Small on purpose: the only thing it protects
 * against is the batch arriving a few milliseconds after its card, and nobody
 * needs a fight from an hour ago in it.
 */
const RELEASED_MAX = 64;

let sink: Sink | null = null;
let sceneId: string | null = null;
const pending = new Map<number, { effects: MapFxEffect[]; timer: number }>();
const released: number[] = [];

/** The map says „I am showing this scene, send effects here". */
export function bindMapFx(scene: string | null, play: Sink | null): void {
  sceneId = scene;
  sink = play;
  if (!play) discardPending();
}

function discardPending(): void {
  for (const entry of pending.values()) window.clearTimeout(entry.timer);
  pending.clear();
}

function emit(effects: readonly MapFxEffect[]): void {
  sink?.(effects);
}

/** A batch from the server. Already trimmed to what this viewer may see. */
export function receiveMapFx(broadcast: MapFxBroadcast): void {
  // A batch for a map we are not looking at is not ours to play. The server
  // filters by viewed scene too; this is the client half of the same rule, for
  // the moment between switching scenes and the server hearing about it.
  if (!sink || broadcast.sceneId !== sceneId) return;
  const after = broadcast.afterMessageId;
  if (after === undefined) {
    emit(broadcast.effects);
    return;
  }
  const index = released.indexOf(after);
  if (index !== -1) {
    released.splice(index, 1);
    emit(broadcast.effects);
    return;
  }
  const existing = pending.get(after);
  if (existing) {
    existing.effects.push(...broadcast.effects);
    return;
  }
  const timer = window.setTimeout(() => {
    const entry = pending.get(after);
    pending.delete(after);
    if (entry) emit(entry.effects);
  }, CARD_WAIT_MS);
  pending.set(after, { effects: [...broadcast.effects], timer });
}

/**
 * A roll's card has just been shown — play whatever was waiting behind it.
 *
 * Called from both reveal paths in `socket.ts`, including the one with no
 * animation at all: „the card is on screen" is the condition, not „the dice
 * finished rolling".
 */
export function releaseMapFx(messageId: number): void {
  const entry = pending.get(messageId);
  if (entry) {
    window.clearTimeout(entry.timer);
    pending.delete(messageId);
    emit(entry.effects);
    return;
  }
  // The batch has not arrived yet (the server sends the card first). Remember
  // that this one is cleared to play the moment it does.
  released.push(messageId);
  if (released.length > RELEASED_MAX) released.shift();
}
