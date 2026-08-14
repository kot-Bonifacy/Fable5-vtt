import { create } from 'zustand';
import type { CpredCreationDraft } from '@vtt/shared';
import { creationErrorText, discardCreation, patchCreation, startCreation } from '../socket.js';

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

  closeCreator: () => set({ open: false, error: null }),

  setDraft: (draft) => set({ draft }),
  setError: (error) => set({ error }),
  setBusy: (busy) => set({ busy }),

  discard: async () => {
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
