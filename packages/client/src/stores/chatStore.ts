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
  | { type: 'message'; message: ChatMessageView }
  | { type: 'note'; id: string; text: string };

interface ChatStoreState {
  /** False until the first `state:sync` (and after a disconnect). */
  synced: boolean;
  campaign: CampaignSummary | null;
  seq: number;
  presence: PresenceEntry[];
  items: ChatItem[];
  hasMoreHistory: boolean;
  loadingHistory: boolean;

  applySync: (payload: StateSyncPayload) => void;
  /** Returns true when a seq gap was detected and a resync is needed. */
  applyMessage: (broadcast: ChatMessageBroadcast) => boolean;
  /** Returns true when a seq gap was detected and a resync is needed. */
  applyPresence: (broadcast: PresenceBroadcast) => boolean;
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

export const useChatStore = create<ChatStoreState>((set, get) => ({
  synced: false,
  campaign: null,
  seq: 0,
  presence: [],
  items: [],
  hasMoreHistory: false,
  loadingHistory: false,

  applySync: (payload) =>
    set((state) => ({
      synced: true,
      campaign: payload.campaign,
      seq: payload.seq,
      presence: payload.presence,
      // Keep local notes (hints/errors) at the tail of the rebuilt feed.
      items: [
        ...payload.messages.map((message): ChatItem => ({ type: 'message', message })),
        ...state.items.filter((item) => item.type === 'note'),
      ],
      hasMoreHistory: payload.hasMoreHistory,
      loadingHistory: false,
    })),

  applyMessage: (broadcast) => {
    const state = get();
    const { resync, seq } = advanceSeq(state, broadcast.seq);
    if (resync) {
      set({ synced: false });
      return true;
    }
    if (hasMessage(state.items, broadcast.message.id)) {
      set({ seq });
      return false;
    }
    set({ seq, items: [...state.items, { type: 'message', message: broadcast.message }] });
    return false;
  },

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
