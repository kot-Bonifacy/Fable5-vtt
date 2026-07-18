import { create } from 'zustand';
import type {
  CampaignSummary,
  ChatHistoryPage,
  ChatMessageBroadcast,
  ChatMessageView,
  PresenceBroadcast,
  PresenceEntry,
  StateSyncPayload,
} from '@vtt/shared';

/** A chat feed entry: a server message or a local, ephemeral system note. */
export type ChatItem =
  { type: 'message'; message: ChatMessageView } | { type: 'note'; id: string; text: string };

interface ChatStoreState {
  /** False until the first `state:sync` (and after a disconnect). */
  synced: boolean;
  campaign: CampaignSummary | null;
  seq: number;
  presence: PresenceEntry[];
  items: ChatItem[];
  /**
   * Roll messages whose 3D dice are still tumbling: fully applied (seq,
   * dedupe) but not shown in the feed until `revealMessage` — players should
   * read the dice before the card spoils the total.
   */
  held: ChatMessageView[];
  hasMoreHistory: boolean;
  loadingHistory: boolean;
  /** Chat input draft — shared so the dice cup can read/execute commands. */
  draft: string;

  applySync: (payload: StateSyncPayload) => void;
  /**
   * Returns true when a seq gap was detected and a resync is needed. With
   * `hold`, the message is withheld from the feed until `revealMessage`.
   */
  applyMessage: (broadcast: ChatMessageBroadcast, hold?: boolean) => boolean;
  /** Moves a held message into the feed (in id order). */
  revealMessage: (id: number) => void;
  setDraft: (draft: string) => void;
  /** Returns true when a seq gap was detected and a resync is needed. */
  applyPresence: (broadcast: PresenceBroadcast) => boolean;
  /**
   * Advances the room seq for non-chat broadcasts (scenes etc.). Returns true
   * when a gap was detected and a resync is needed.
   */
  applySeq: (seq: number | undefined) => boolean;
  prependHistory: (page: ChatHistoryPage) => void;
  setLoadingHistory: (loading: boolean) => void;
  addNote: (text: string) => void;
  setDesynced: () => void;
}

let noteCounter = 0;

function hasMessage(items: ChatItem[], id: number): boolean {
  return items.some((item) => item.type === 'message' && item.message.id === id);
}

/**
 * Seq bookkeeping shared by broadcast handlers. Returns `resync: true` when a
 * gap is detected — the caller then asks the server for a full `state:sync`.
 */
function advanceSeq(
  state: ChatStoreState,
  seq: number | undefined,
): { resync: boolean; seq: number } {
  if (seq === undefined || !state.synced) return { resync: false, seq: state.seq };
  if (seq > state.seq + 1) return { resync: true, seq: state.seq };
  return { resync: false, seq: Math.max(seq, state.seq) };
}

/**
 * Inserts a message into the feed keeping server-id order among messages
 * (held rolls reveal later than they arrived; notes stay where they are).
 */
function insertByIdOrder(items: ChatItem[], message: ChatMessageView): ChatItem[] {
  let insertAt = items.length;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.type === 'message' && item.message.id < message.id) break;
    if (item.type === 'message' && item.message.id > message.id) insertAt = i;
  }
  return [...items.slice(0, insertAt), { type: 'message', message }, ...items.slice(insertAt)];
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  synced: false,
  campaign: null,
  seq: 0,
  presence: [],
  items: [],
  held: [],
  hasMoreHistory: false,
  loadingHistory: false,
  draft: '',

  applySync: (payload) =>
    set((state) => ({
      synced: true,
      campaign: payload.campaign,
      seq: payload.seq,
      presence: payload.presence,
      // Keep local notes (hints/errors) at the tail of the rebuilt feed. Held
      // rolls are part of the server history, so they show right away — a
      // resync must never lose messages.
      items: [
        ...payload.messages.map((message): ChatItem => ({ type: 'message', message })),
        ...state.items.filter((item) => item.type === 'note'),
      ],
      held: [],
      hasMoreHistory: payload.hasMoreHistory,
      loadingHistory: false,
    })),

  applyMessage: (broadcast, hold = false) => {
    const state = get();
    const { resync, seq } = advanceSeq(state, broadcast.seq);
    if (resync) {
      set({ synced: false });
      return true;
    }
    const { message } = broadcast;
    if (hasMessage(state.items, message.id) || state.held.some((m) => m.id === message.id)) {
      set({ seq });
      return false;
    }
    if (hold) {
      set({ seq, held: [...state.held, message] });
    } else {
      set({ seq, items: [...state.items, { type: 'message', message }] });
    }
    return false;
  },

  revealMessage: (id) => {
    const state = get();
    const message = state.held.find((m) => m.id === id);
    if (!message) return;
    set({
      held: state.held.filter((m) => m.id !== id),
      items: hasMessage(state.items, id) ? state.items : insertByIdOrder(state.items, message),
    });
  },

  setDraft: (draft) => set({ draft }),

  applyPresence: (broadcast) => {
    const state = get();
    const { resync, seq } = advanceSeq(state, broadcast.seq);
    if (resync) {
      set({ synced: false });
      return true;
    }
    set({ seq, presence: broadcast.presence });
    return false;
  },

  applySeq: (incoming) => {
    const state = get();
    const { resync, seq } = advanceSeq(state, incoming);
    if (resync) {
      set({ synced: false });
      return true;
    }
    set({ seq });
    return false;
  },

  prependHistory: (page) =>
    set((state) => ({
      items: [
        ...page.messages
          .filter((message) => !hasMessage(state.items, message.id))
          .map((message): ChatItem => ({ type: 'message', message })),
        ...state.items,
      ],
      hasMoreHistory: page.hasMore,
      loadingHistory: false,
    })),

  setLoadingHistory: (loading) => set({ loadingHistory: loading }),

  addNote: (text) =>
    set((state) => ({
      items: [...state.items, { type: 'note', id: `note-${++noteCounter}`, text }],
    })),

  setDesynced: () => set({ synced: false }),
}));

/** Id of the oldest server message in the feed — pagination cursor. */
export function oldestMessageId(items: ChatItem[]): number | null {
  for (const item of items) {
    if (item.type === 'message') return item.message.id;
  }
  return null;
}
