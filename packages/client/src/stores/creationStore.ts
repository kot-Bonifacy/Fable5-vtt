import { create } from 'zustand';
import type {
  CreationDraftPeek,
  CreationPermitState,
  CpredCreationDraft,
  CreationDraftView,
  CreationPatchPayload,
  RollGesture,
} from '@vtt/shared';
import type { CpredLifepathGroup, CpredLifepathTable, CpredStatId } from '@vtt/shared';
import {
  CPRED_CREATION_STEPS,
  CPRED_STAT_LABELS,
  LIFEPATH_GROUP_LABELS,
  creationIssueStep,
  creationNextStatToRoll,
  lifepathDataOf,
  lifepathUnanswered,
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
import { useCharacterStore } from './characterStore.js';
import { useRollStore, type PendingCreation } from './rollStore.js';

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
  /**
   * The furthest step this window has shown for the current draft (naprawa
   * 2a). Tabs count what is missing only on steps the player has already been
   * to, so a fresh draft does not open under a pile of red badges.
   */
  visited: { draftId: string | null; index: number };
  /** A field the summary asked to jump to, waiting for its step to render. */
  focusField: string | null;
  /**
   * The header of my draft on the server, learnt at `state:sync` (naprawa 3d)
   * — what the „Postacie" tab shows as „Wznów szkic…" while the window is not
   * open. Once `draft` is loaded it takes over; finishing or discarding clears
   * both.
   */
  peek: CreationDraftPeek | null;
  setPeek: (peek: CreationDraftPeek | null) => void;
  /**
   * My standing with the GM's consent to a new character (24.09); null until
   * the first answer after `state:sync`. The GM always reads as granted.
   */
  permit: CreationPermitState | null;
  setPermit: (permit: CreationPermitState | null) => void;
  /**
   * The rules a player reads before the first draft (24.09) are on screen.
   * They live here, not in the „Postacie" tab, so every way into the wizard —
   * the tab, the consent notice — goes through them (20.10: the notice opened
   * an empty window the server refused to fill).
   */
  rulesOpen: boolean;
  setRulesOpen: (rulesOpen: boolean) => void;
  /** The GM threw this draft away: close the wizard and forget it. */
  dropDiscarded: (draftId: string) => void;

  openCreator: () => Promise<void>;
  closeCreator: () => void;
  setDraft: (draft: CpredCreationDraft | null) => void;
  setError: (error: string | null) => void;
  setBusy: (busy: boolean) => void;
  discard: () => Promise<void>;
  markVisited: (step: CpredCreationDraft['step']) => void;
  /** Opens the step that fixes an issue and points the window at its field. */
  goToField: (field: string) => void;
  clearFocusField: () => void;
  /**
   * Sends a patch and stores whatever the server made of it. A `field` names
   * one text or number input (naprawa 2b): a newer write of the same field
   * replaces one still waiting in the queue instead of queuing behind it, so
   * fast typing on a slow link sends two writes, not twenty.
   */
  patch: (patch: DraftPatch, options?: { field?: string }) => Promise<boolean>;
}

/**
 * Patches leave one at a time. Each one is a read-modify-write of the stored
 * draft on the server, so two in flight could lose the earlier — and holding a
 * skill's „+" down is exactly how you fire two.
 */
let queue: Promise<unknown> = Promise.resolve();
type DraftPatch =
  Record<string, unknown> | ((draft: CpredCreationDraft) => Record<string, unknown>);

/** A queued intent; `field` lets a newer write of the same input replace it. */
interface QueuedPatch {
  patch: DraftPatch;
  field?: string;
}
const deferredPatches: QueuedPatch[] = [];

/**
 * Field writes that sit in the queue and have not left yet. Only these may be
 * replaced — a write already sent is the server's, and the newer text simply
 * follows it.
 */
const waitingFieldWrites = new Map<string, { entry: QueuedPatch; result: Promise<boolean> }>();

/**
 * Holds an intent behind a refused write. A newer write of the same field
 * takes the older one's place, which keeps its turn among the other intents.
 */
function deferPatch(entry: QueuedPatch): void {
  const older = entry.field
    ? deferredPatches.find((queued) => queued.field === entry.field)
    : undefined;
  if (older) older.patch = entry.patch;
  else deferredPatches.push(entry);
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

type DraftAck = Awaited<ReturnType<typeof patchCreation>>;

/**
 * Stores one acknowledged patch, or keeps the refused one for an explicit retry.
 * Runs only inside the queue, so nothing can slip in between.
 */
function settlePatch(
  ack: DraftAck,
  resolved: Record<string, unknown>,
  guard: Omit<CreationPatchPayload, 'patch'>,
): boolean {
  if (!ack.ok || !ack.data) {
    useCreationStore.setState({
      busy: false,
      pendingPatch: resolved,
      pendingGuard: guard,
      error: creationErrorText(ack.ok ? undefined : ack.error),
    });
    return false;
  }
  useCreationStore.setState({
    draft: ack.data.draft,
    draftId: ack.data.id,
    revision: ack.data.revision,
    rankApproved: ack.data.rankApproved,
    pendingPatch: null,
    pendingGuard: null,
    busy: false,
    error: null,
  });
  return true;
}

/** Builds a patch against the newest stored draft and sends it. Queue only. */
async function sendPatch(patch: DraftPatch): Promise<boolean> {
  const { draft, draftId, revision } = useCreationStore.getState();
  if (!draft) {
    useCreationStore.setState({ busy: false });
    return false;
  }
  useCreationStore.setState({ busy: true });
  const resolved = typeof patch === 'function' ? patch(draft) : patch;
  const guard = { draftId: draftId ?? undefined, revision, requestId: crypto.randomUUID() };
  return settlePatch(await patchCreation(resolved, guard), resolved, guard);
}

export const useCreationStore = create<CreationStoreState>((set, get) => ({
  open: false,
  draftId: null,
  revision: 0,
  pendingGuard: null,
  reload: async () => {
    // Inside the queue: a write already waiting there must not leave with the
    // state this reload is about to throw away.
    await enqueue(async () => {
      deferredPatches.length = 0;
      set({ pendingPatch: null, pendingGuard: null });
    });
    await get().openCreator();
  },
  rankApproved: false,
  pendingPatch: null,
  // The refused write and every intent deferred behind it go out in one queue
  // turn and in their original order; a click made meanwhile waits behind them.
  retry: async () => {
    set({ busy: true });
    return enqueue(async () => {
      const pending = get().pendingPatch;
      const guard = get().pendingGuard;
      if (pending) {
        const ack = await patchCreation(pending, guard ?? {});
        if (!settlePatch(ack, pending, guard ?? {})) return false;
      }
      while (deferredPatches.length) {
        if (!(await sendPatch(deferredPatches.shift()!.patch))) return false;
      }
      set({ busy: false });
      return true;
    });
  },
  draft: null,
  error: null,
  busy: false,
  visited: { draftId: null, index: 0 },
  focusField: null,
  peek: null,
  setPeek: (peek) => set({ peek }),
  permit: null,
  setPermit: (permit) => set({ permit }),
  rulesOpen: false,
  setRulesOpen: (rulesOpen) => set({ rulesOpen }),
  dropDiscarded: (draftId) => {
    const { draftId: mine, peek } = get();
    if (mine !== draftId && peek?.id !== draftId) return;
    clearCreationCup();
    deferredPatches.length = 0;
    set({
      open: false,
      draft: null,
      draftId: null,
      pendingPatch: null,
      busy: false,
      peek: null,
      error: 'MG wyrzucił ten szkic postaci.',
    });
  },

  markVisited: (step) => {
    const index = CPRED_CREATION_STEPS.indexOf(step);
    const { draftId, visited } = get();
    if (visited.draftId !== draftId) set({ visited: { draftId, index } });
    else if (index > visited.index) set({ visited: { draftId, index } });
  },

  goToField: (field) => {
    set({ focusField: field });
    const step = creationIssueStep(field);
    if (get().draft?.step !== step) void get().patch({ step });
  },

  clearFocusField: () => set({ focusField: null }),

  openCreator: async () => {
    // A draft on the server is resumed without the rules; without one, a
    // player who has not accepted them reads them first.
    const { permit, peek, draft } = get();
    if (!peek && !draft && permit?.status === 'granted' && !permit.rulesAccepted) {
      set({ rulesOpen: true });
      return;
    }
    set({ open: true, busy: true, error: null });
    const ack = await enqueue(() => startCreation());
    if (!ack.ok || !ack.data) {
      // A stale permit: the server knows the rules are still unread.
      if (!ack.ok && ack.error === 'CREATION_RULES_PENDING') {
        set({ open: false, busy: false, rulesOpen: true });
        return;
      }
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
    set({
      open: false,
      draft: null,
      draftId: null,
      pendingPatch: null,
      error: null,
      busy: false,
      peek: null,
    });
  },

  patch: async (patch, options) => {
    const field = options?.field;
    const waiting = field ? waitingFieldWrites.get(field) : undefined;
    if (waiting) {
      waiting.entry.patch = patch;
      return waiting.result;
    }
    set({ busy: true });
    const entry: QueuedPatch = { patch, field };
    const result = enqueue(async () => {
      if (field && waitingFieldWrites.get(field)?.entry === entry) waitingFieldWrites.delete(field);
      if (get().pendingPatch) {
        deferPatch(entry);
        set({ busy: false });
        return false;
      }
      return sendPatch(entry.patch);
    });
    if (field) waitingFieldWrites.set(field, { entry, result });
    return result;
  },
}));

/** Runs a creation call through the same queue the patches use. */
export function enqueueCreationCall<T>(task: () => Promise<T>): Promise<T> {
  return enqueue(task);
}

/** Puts one creator roll in the cup, waiting for a shake. */
export function loadCreationCup(pending: PendingCreation): void {
  useRollStore.getState().loadCreationCup(pending);
}

/** Takes it back out — window closed, method changed, `Esc` pressed. */
export function clearCreationCup(): void {
  if (useRollStore.getState().creation) useRollStore.getState().clearCup();
}

/** The cup for one stat; `chain` walks on to the next one after the throw. */
export function creationStatCup(
  statId: CpredStatId,
  roleName: string,
  chain = false,
): PendingCreation {
  const label = CPRED_STAT_LABELS[statId];
  return {
    title: `${label.name} (${label.abbr})${roleName ? ` — ${roleName}` : ''}`,
    roll: { kind: 'stat', statId },
    notation: '1d10',
    ...(chain ? { chain: 'stats' as const } : {}),
  };
}

/** The cup for one Lifepath table; `index` names the friend, enemy or love. */
export function creationLifepathCup(
  table: CpredLifepathTable,
  index?: number,
  chain = false,
): PendingCreation {
  return {
    title: `Ścieżka Życia — ${table.label}`,
    roll: { kind: 'lifepath', tableId: table.id, ...(index === undefined ? {} : { index }) },
    notation: `1d${table.sides}`,
    ...(chain ? { chain: 'lifepath' as const } : {}),
  };
}

/** „Rzuć 1k10 i odejmij 7" — how many friends, enemies or tragic loves. */
export function creationCountCup(group: CpredLifepathGroup, sides: number): PendingCreation {
  return {
    title: `${LIFEPATH_GROUP_LABELS[group]} — ilu`,
    roll: { kind: 'lifepath-count', group },
    notation: `1d${sides}`,
  };
}

/**
 * What „Weź kubek" loads next: the first stat without a die, or the first
 * Lifepath table without an answer — null when there is nothing left.
 */
export function nextCreationCup(
  draft: CpredCreationDraft,
  chain: 'stats' | 'lifepath',
): PendingCreation | null {
  const registry = useCharacterStore.getState().registry;
  if (chain === 'stats') {
    if (draft.method !== 'edgerunner') return null;
    const statId = creationNextStatToRoll(draft);
    const roleName = registry.roles.find((entry) => entry.id === draft.roleId)?.name ?? '';
    return statId ? creationStatCup(statId, roleName, true) : null;
  }
  const table = lifepathUnanswered(draft.lifepath, lifepathDataOf(registry), draft.roleId)[0];
  return table ? creationLifepathCup(table, undefined, true) : null;
}

function cupIsEmpty(): boolean {
  const cup = useRollStore.getState();
  return (
    !cup.pending &&
    !cup.initiative &&
    !cup.attack &&
    !cup.evasion &&
    !cup.grapple &&
    !cup.facedown &&
    !cup.creation
  );
}

/**
 * Throws what the cup held, with its gesture, and stores whatever came back
 * (zlecenie MG z 17.09: one die per throw). A cup loaded by „Weź kubek" then
 * waits with the next stat or table — unless the window closed or the hand has
 * picked up something else while the dice rolled.
 *
 * Lives here rather than in `DiceCup` because the draft is this store's
 * business: the cup's job ends the moment the hand lets go.
 */
export async function rollCreationFromCup(
  pending: PendingCreation,
  gesture: RollGesture,
): Promise<void> {
  const { roll } = pending;
  const ok = await runCreationCall(() =>
    roll.kind === 'stat'
      ? rollCreationStats(roll.statId, gesture)
      : roll.kind === 'lifepath'
        ? rollCreationLifepath([roll.tableId], roll.index, gesture)
        : rollCreationLifepathCount(roll.group, gesture),
  );
  if (!ok || !pending.chain) return;
  const { open, draft } = useCreationStore.getState();
  if (!open || !draft || !cupIsEmpty()) return;
  const next = nextCreationCup(draft, pending.chain);
  if (next) loadCreationCup({ ...next, quiet: true });
}

/** The GM's plain button: every stat still missing, no cup, one card. */
export async function rollMissingStatsPlain(): Promise<void> {
  await runCreationCall(() => rollCreationStats());
}

/** The GM's plain button: the given Lifepath tables in one throw, no cup. */
export async function rollLifepathTablesPlain(tableIds: string[]): Promise<void> {
  await runCreationCall(() => rollCreationLifepath(tableIds));
}

/**
 * One item into or out of the starting basket (stage 25c). Same queue as the
 * patches, for the same reason: holding „+" down fires two calls, and each one
 * is a read-modify-write of the same stored draft.
 */
export async function buyCreationEntry(
  entryId: string,
  delta: 1 | -1,
  /** Etap 46c: kaliber kupowanej amunicji — typ broni. */
  weaponTypeId?: string,
): Promise<void> {
  await runCreationCall(() => buyCreationItem(entryId, delta, weaponTypeId));
}

async function runCreationCall(
  call: () => Promise<{
    ok: boolean;
    error?: string;
    data?: CreationDraftView<CpredCreationDraft>;
  }>,
): Promise<boolean> {
  const store = useCreationStore.getState();
  if (store.pendingPatch) {
    store.setError('Najpierw ponów zapis oczekujących zmian.');
    return false;
  }
  store.setBusy(true);
  store.setError(null);
  return enqueue(async () => {
    if (useCreationStore.getState().pendingPatch) {
      store.setBusy(false);
      return false;
    }
    store.setBusy(true);
    const ack = await call();
    if (!ack.ok || !ack.data) {
      store.setBusy(false);
      store.setError(creationErrorText(ack.ok ? undefined : ack.error));
      return false;
    }
    useCreationStore.setState({
      draft: ack.data.draft,
      draftId: ack.data.id,
      revision: ack.data.revision,
      rankApproved: ack.data.rankApproved,
    });
    store.setBusy(false);
    return true;
  });
}
