import { create } from 'zustand';
import type { CpredCreationDraft, RollGesture } from '@vtt/shared';
import {
  buyCreationItem,
  creationErrorText,
  discardCreation,
  patchCreation,
  rollCreationLifepath,
  rollCreationLifepathCount,
  rollCreationStats,
  startCreation,
} from '../socket.js';
import { useRollStore } from './rollStore.js';

/**
 * The character creator's window state (stage 25a).
 *
 * The draft itself is **not** edited here — every change goes to the server and
 * comes back, because the server is the one holding the tables and the dice.
 * That makes the wizard a touch slower than a local form and is the point: a
 * Krawędziarz who could edit his own spread would not be rolling anything.
 */
interface CreationStoreState {
  open: boolean;
  /** Null while the first `creation:start` is in flight. */
  draft: CpredCreationDraft | null;
  /** Polish message from the last refused call, shown in the window. */
  error: string | null;
  /** A call is in flight — the window shows it and the dice button waits. */
  busy: boolean;

  openCreator: () => Promise<void>;
  closeCreator: () => void;
  setDraft: (draft: CpredCreationDraft | null) => void;
  setError: (error: string | null) => void;
  setBusy: (busy: boolean) => void;
  discard: () => Promise<void>;
  /** Sends a patch and stores whatever the server made of it. */
  patch: (patch: Record<string, unknown>) => Promise<boolean>;
}

/**
 * Patches leave one at a time. Each one is a read-modify-write of the stored
 * draft on the server, so two in flight could lose the earlier — and holding a
 * skill's „+" down is exactly how you fire two.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

export const useCreationStore = create<CreationStoreState>((set) => ({
  open: false,
  draft: null,
  error: null,
  busy: false,

  openCreator: async () => {
    set({ open: true, busy: true, error: null });
    const ack = await enqueue(() => startCreation());
    if (!ack.ok || !ack.data) {
      set({ busy: false, error: creationErrorText(ack.ok ? undefined : ack.error) });
      return;
    }
    set({ draft: ack.data.draft, busy: false, error: null });
  },

  // Closing the window puts the cup back on the shelf: a spread waiting to be
  // shaken for a wizard nobody can see would refuse into a hidden error.
  closeCreator: () => {
    clearCreationCup();
    set({ open: false, error: null });
  },

  setDraft: (draft) => set({ draft }),
  setError: (error) => set({ error }),
  setBusy: (busy) => set({ busy }),

  discard: async () => {
    clearCreationCup();
    await enqueue(() => discardCreation());
    set({ open: false, draft: null, error: null, busy: false });
  },

  patch: async (patch) => {
    set({ busy: true, error: null });
    const ack = await enqueue(() => patchCreation(patch));
    if (!ack.ok || !ack.data) {
      set({ busy: false, error: creationErrorText(ack.ok ? undefined : ack.error) });
      return false;
    }
    set({ draft: ack.data.draft, busy: false });
    return true;
  },
}));

/** Runs a creation call through the same queue the patches use. */
export function enqueueCreationCall<T>(task: () => Promise<T>): Promise<T> {
  return enqueue(task);
}

/** Puts the stat spread in the cup, waiting for a shake (stage 25a). */
export function loadCreationCup(title: string): void {
  useRollStore.getState().loadCreationCup({ title });
}

/** Takes it back out — window closed, method changed, `Esc` pressed. */
export function clearCreationCup(): void {
  if (useRollStore.getState().creation) useRollStore.getState().clearCup();
}

/**
 * Rolls the spread with the cup's gesture and stores whatever came back.
 *
 * Lives here rather than in `DiceCup` because the draft is this store's
 * business: the cup's job ends the moment the hand lets go.
 */
export async function rollCreationWithGesture(gesture?: RollGesture): Promise<void> {
  const store = useCreationStore.getState();
  store.setBusy(true);
  store.setError(null);
  const ack = await enqueue(() => rollCreationStats(gesture));
  if (!ack.ok || !ack.data) {
    store.setBusy(false);
    store.setError(creationErrorText(ack.ok ? undefined : ack.error));
    return;
  }
  store.setDraft(ack.data.draft);
  store.setBusy(false);
}

/**
 * Rolls Lifepath tables on the server and stores what came back (stage 25b).
 *
 * The list is passed through whole rather than one call per table: „Rzuć całą
 * Ścieżkę" is one throw and one chat card, which is what keeps the session-zero
 * log readable.
 */
export async function rollLifepathTables(tableIds: string[], index?: number): Promise<void> {
  await runCreationCall(() => rollCreationLifepath(tableIds, index));
}

/** „Rzuć 1k10 i odejmij 7" — how many friends, enemies or tragic loves. */
export async function rollLifepathCount(group: string): Promise<void> {
  await runCreationCall(() => rollCreationLifepathCount(group));
}

/**
 * One item into or out of the starting basket (stage 25c). Same queue as the
 * patches, for the same reason: holding „+" down fires two calls, and each one
 * is a read-modify-write of the same stored draft.
 */
export async function buyCreationEntry(entryId: string, delta: 1 | -1): Promise<void> {
  await runCreationCall(() => buyCreationItem(entryId, delta));
}

async function runCreationCall(
  call: () => Promise<{ ok: boolean; error?: string; data?: { draft: CpredCreationDraft } }>,
): Promise<void> {
  const store = useCreationStore.getState();
  store.setBusy(true);
  store.setError(null);
  const ack = await enqueue(call);
  if (!ack.ok || !ack.data) {
    store.setBusy(false);
    store.setError(creationErrorText(ack.ok ? undefined : ack.error));
    return;
  }
  store.setDraft(ack.data.draft);
  store.setBusy(false);
}
