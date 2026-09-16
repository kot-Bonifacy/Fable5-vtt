import { create } from 'zustand';
import type {
  CpredCreationDraft,
  CreationDraftView,
  CreationPatchPayload,
  RollGesture,
} from '@vtt/shared';
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
  draftId: string | null;
  revision: number;
  pendingGuard: Omit<CreationPatchPayload, 'patch'> | null;
  reload: () => Promise<void>;
  rankApproved: boolean;
  pendingPatch: Record<string, unknown> | null;
  retry: () => Promise<boolean>;
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
  patch: (
    patch: Record<string, unknown> | ((draft: CpredCreationDraft) => Record<string, unknown>),
  ) => Promise<boolean>;
}

/**
 * Patches leave one at a time. Each one is a read-modify-write of the stored
 * draft on the server, so two in flight could lose the earlier — and holding a
 * skill's „+" down is exactly how you fire two.
 */
let queue: Promise<unknown> = Promise.resolve();
type DraftPatch =
  Record<string, unknown> | ((draft: CpredCreationDraft) => Record<string, unknown>);
const deferredPatches: DraftPatch[] = [];

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

export const useCreationStore = create<CreationStoreState>((set, get) => ({
  open: false,
  draftId: null,
  revision: 0,
  pendingGuard: null,
  reload: async () => {
    deferredPatches.length = 0;
    set({ pendingPatch: null, pendingGuard: null });
    await get().openCreator();
  },
  rankApproved: false,
  pendingPatch: null,
  retry: async () => {
    const pending = get().pendingPatch;
    const guard = get().pendingGuard;
    if (!pending) return true;
    set({ pendingPatch: null });
    set({ busy: true });
    const ack = await enqueue(() => patchCreation(pending, guard ?? {}));
    if (!ack.ok || !ack.data) {
      set({
        busy: false,
        pendingPatch: pending,
        error: creationErrorText(ack.ok ? undefined : ack.error),
      });
      return false;
    }
    set({
      draft: ack.data.draft,
      revision: ack.data.revision,
      rankApproved: ack.data.rankApproved,
      pendingGuard: null,
      error: null,
      busy: false,
    });
    while (deferredPatches.length) {
      const next = deferredPatches.shift()!;
      if (!(await get().patch(next))) return false;
    }
    return true;
  },
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
    set({
      draft: ack.data.draft,
      draftId: ack.data.id,
      revision: ack.data.revision,
      rankApproved: ack.data.rankApproved,
      busy: false,
      error: null,
    });
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
    set({ busy: true });
    const draftId = get().draftId;
    const ack = await enqueue(() => discardCreation(draftId ?? undefined));
    if (!ack.ok) {
      set({ busy: false, error: creationErrorText(ack.error) });
      return;
    }
    deferredPatches.length = 0;
    set({ open: false, draft: null, draftId: null, pendingPatch: null, error: null, busy: false });
  },

  patch: async (patch) => {
    set({ busy: true });
    return enqueue(async () => {
      if (get().pendingPatch) {
        deferredPatches.push(patch);
        set({ busy: false });
        return false;
      }
      const draft = get().draft;
      if (!draft) {
        set({ busy: false });
        return false;
      }
      set({ busy: true });
      const resolved = typeof patch === 'function' ? patch(draft) : patch;
      const guard = {
        draftId: get().draftId ?? undefined,
        revision: get().revision,
        requestId: crypto.randomUUID(),
      };
      const ack = await patchCreation(resolved, guard);
      if (!ack.ok || !ack.data) {
        set({
          busy: false,
          pendingPatch: resolved,
          pendingGuard: guard,
          error: creationErrorText(ack.ok ? undefined : ack.error),
        });
        return false;
      }
      set({
        draft: ack.data.draft,
        draftId: ack.data.id,
        revision: ack.data.revision,
        rankApproved: ack.data.rankApproved,
        busy: false,
        error: null,
      });
      return true;
    });
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
  await runCreationCall(() => rollCreationStats(gesture));
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
  call: () => Promise<{
    ok: boolean;
    error?: string;
    data?: CreationDraftView<CpredCreationDraft>;
  }>,
): Promise<void> {
  const store = useCreationStore.getState();
  if (store.pendingPatch) {
    store.setError('Najpierw ponów zapis oczekujących zmian.');
    return;
  }
  store.setBusy(true);
  store.setError(null);
  await enqueue(async () => {
    if (useCreationStore.getState().pendingPatch) {
      store.setBusy(false);
      return;
    }
    store.setBusy(true);
    const ack = await call();
    if (!ack.ok || !ack.data) {
      store.setBusy(false);
      store.setError(creationErrorText(ack.ok ? undefined : ack.error));
      return;
    }
    useCreationStore.setState({
      draft: ack.data.draft,
      draftId: ack.data.id,
      revision: ack.data.revision,
      rankApproved: ack.data.rankApproved,
    });
    store.setBusy(false);
  });
}
