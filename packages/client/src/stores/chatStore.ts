import { create } from 'zustand';
import type {
  BotActivityEntry,
  BotTraceBroadcast,
  CampaignSummary,
  ChatHistoryPage,
  ChatMessageBroadcast,
  ChatMessageView,
  CheckCallEntry,
  PresenceBroadcast,
  PresenceEntry,
  StateSyncPayload,
} from '@vtt/shared';
import { isCheckCallOpen } from '@vtt/shared';

/**
 * A button offered on a local note (stage 16c).
 *
 * The refusal card of „cel za osłoną" needs two answers — shoot the car, or
 * declare that he leaned out — and neither is worth a chat message on the
 * server: nothing has been rolled or spent yet, and the choice belongs to the
 * person who is about to press the trigger. So the buttons live on the
 * ephemeral note, and the decision only reaches the log once it has been made.
 */
export interface ChatNoteAction {
  label: string;
  title?: string;
  run: () => void;
}

/** A chat feed entry: a server message or a local, ephemeral system note. */
export type ChatItem =
  | { type: 'message'; message: ChatMessageView }
  | { type: 'note'; id: string; text: string; actions?: ChatNoteAction[] };

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
  /** Bot turns in flight („Vex pisze…" plus the queue), newest state wins. */
  botActivity: BotActivityEntry[];
  /**
   * GM-only diagnostics of delivered bot lines, keyed by message id. Players
   * never receive these, so a bot line looks exactly like an NPC line the GM
   * typed by hand.
   */
  botTraces: Record<number, BotTraceBroadcast>;

  applySync: (payload: StateSyncPayload) => void;
  /**
   * Returns true when a seq gap was detected and a resync is needed. With
   * `hold`, the message is withheld from the feed until `revealMessage`.
   */
  applyMessage: (broadcast: ChatMessageBroadcast, hold?: boolean) => boolean;
  /** Moves a held message into the feed (in id order). */
  revealMessage: (id: number) => void;
  /**
   * Replaces a message already in the feed (stage 15: the GM takes back an
   * applied damage entry). Returns true when a seq gap was detected.
   */
  updateMessage: (broadcast: ChatMessageBroadcast) => boolean;
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
  addNote: (text: string, actions?: ChatNoteAction[]) => void;
  setDesynced: () => void;
  setBotActivity: (entries: BotActivityEntry[]) => void;
  addBotTrace: (trace: BotTraceBroadcast) => void;
}

let noteCounter = 0;

/**
 * Wezwanie do Testu, które czeka **na tego gracza** (etap 32).
 *
 * Czytane wprost z feedu, bez drugiego magazynu stanu: karta wezwania i tak
 * w nim siedzi, a dwa źródła prawdy o tym, czy MG jeszcze czeka, rozjechałyby
 * się przy pierwszym „Odwołaj". Bierzemy **ostatnie** otwarte: przy dwóch
 * wezwaniach naraz kubek prowadzi do świeższego, a starsze zostaje na czacie.
 *
 * Świadomie tylko właściciel karty: MG, który wystawił pięć wezwań, miałby
 * kubek migający bez przerwy, a jego „Rzuć za nią" stoi na karcie czatu.
 *
 * **Prośba o Test (etap 40) nie zapala kubka** i rodzaj `request` jest tu
 * pomijany wprost, a nie przez to, że akurat nosi payload w innym polu:
 * gracz, którego kubek zawołałby na własną prośbę, rzuciłby, zanim MG zdąży
 * ustawić próg — a przy prośbie progu jeszcze **nie ma**.
 */
export function openCheckCallFor(
  items: ChatItem[],
  userId: string,
): { messageId: number; entry: CheckCallEntry } | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.type !== 'message') continue;
    if (item.message.kind !== 'check') continue;
    const entry = item.message.check;
    if (!entry || entry.ownerId !== userId) continue;
    if (!isCheckCallOpen(entry)) continue;
    return { messageId: item.message.id, entry };
  }
  return null;
}

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
  botActivity: [],
  botTraces: {},

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

  updateMessage: (broadcast) => {
    const state = get();
    const { resync, seq } = advanceSeq(state, broadcast.seq);
    if (resync) {
      set({ synced: false });
      return true;
    }
    const { message } = broadcast;
    set({
      seq,
      items: state.items.map((item) =>
        item.type === 'message' && item.message.id === message.id
          ? { type: 'message', message }
          : item,
      ),
      held: state.held.map((held) => (held.id === message.id ? message : held)),
    });
    return false;
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

  addNote: (text, actions) =>
    set((state) => ({
      items: [
        ...state.items,
        {
          type: 'note',
          id: `note-${++noteCounter}`,
          text,
          ...(actions && actions.length > 0 ? { actions } : {}),
        },
      ],
    })),

  setDesynced: () => set({ synced: false, botActivity: [] }),

  setBotActivity: (entries) => set({ botActivity: entries }),

  addBotTrace: (trace) =>
    set((state) => ({ botTraces: { ...state.botTraces, [trace.messageId]: trace } })),
}));

/** Id of the oldest server message in the feed — pagination cursor. */
export function oldestMessageId(items: ChatItem[]): number | null {
  for (const item of items) {
    if (item.type === 'message') return item.message.id;
  }
  return null;
}
