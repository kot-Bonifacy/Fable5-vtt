import { create } from 'zustand';
import type {
  BotPatch,
  BotProfileData,
  BotReplyBroadcast,
  BotTemplate,
  BotView,
  StateSyncPayload,
} from '@vtt/shared';
import { mergeBotData, parseBotTemplates } from '@vtt/shared';

export type BotSaveState = 'saving' | 'saved' | 'error';

/** One line of the editor's test conversation (in memory, never persisted). */
export interface BotTestTurn {
  id: string;
  role: 'user' | 'bot';
  text: string;
  /** A bot turn still being generated. */
  pending?: boolean;
  /** The answer was regenerated after the bot stepped out of character. */
  retried?: boolean;
  /** Polish description of a slip that survived the retry. */
  warning?: string | null;
  error?: string | null;
  usage?: BotReplyBroadcast['usage'];
}

interface BotStoreState {
  bots: Record<string, BotView>;
  order: string[];
  /** Open editor windows; the last entry renders on top. */
  openEditors: string[];
  pendingSaves: Record<string, number>;
  saveStates: Record<string, BotSaveState>;
  /** Archetypes from /public/bot-templates/index.json. */
  templates: BotTemplate[];
  /** Test conversations per bot; cleared with the „wyczyść" button. */
  conversations: Record<string, BotTestTurn[]>;
  /** In-flight test generation per bot (request id). */
  pendingReplies: Record<string, string>;

  applySync: (payload: StateSyncPayload) => void;
  applyUpsert: (bot: BotView) => void;
  applyDelete: (botId: string) => void;
  localPatch: (botId: string, patch: BotPatch) => void;
  beginSave: (botId: string) => void;
  endSave: (botId: string, serverView: BotView | null, ok: boolean) => void;
  openEditor: (botId: string) => void;
  closeEditor: (botId: string) => void;
  focusEditor: (botId: string) => void;
  setTemplates: (templates: BotTemplate[]) => void;

  addUserTurn: (botId: string, text: string) => void;
  startBotTurn: (botId: string, requestId: string) => void;
  appendChunk: (botId: string, text: string, reset: boolean) => void;
  finishBotTurn: (reply: BotReplyBroadcast) => void;
  failBotTurn: (botId: string, error: string) => void;
  clearConversation: (botId: string) => void;
}

function turnId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Applies a change to the last (pending) bot turn of a conversation. */
function patchLastBotTurn(
  turns: BotTestTurn[],
  change: (turn: BotTestTurn) => BotTestTurn,
): BotTestTurn[] {
  const index = turns.findLastIndex((turn) => turn.role === 'bot' && turn.pending);
  if (index === -1) return turns;
  return turns.map((turn, i) => (i === index ? change(turn) : turn));
}

export const useBotStore = create<BotStoreState>((set, get) => ({
  bots: {},
  order: [],
  openEditors: [],
  pendingSaves: {},
  saveStates: {},
  templates: [],
  conversations: {},
  pendingReplies: {},

  applySync: (payload) =>
    set((state) => {
      const bots: Record<string, BotView> = {};
      const order: string[] = [];
      for (const bot of payload.bots ?? []) {
        bots[bot.id] = bot;
        order.push(bot.id);
      }
      return { bots, order, openEditors: state.openEditors.filter((id) => id in bots) };
    }),

  applyUpsert: (bot) =>
    set((state) => {
      // Our own edits in flight must not be clobbered by an older snapshot.
      if ((state.pendingSaves[bot.id] ?? 0) > 0) return state;
      const known = bot.id in state.bots;
      return {
        bots: { ...state.bots, [bot.id]: bot },
        order: known ? state.order : [...state.order, bot.id],
      };
    }),

  applyDelete: (botId) =>
    set((state) => {
      if (!(botId in state.bots)) return state;
      const bots = { ...state.bots };
      delete bots[botId];
      return {
        bots,
        order: state.order.filter((id) => id !== botId),
        openEditors: state.openEditors.filter((id) => id !== botId),
      };
    }),

  localPatch: (botId, patch) =>
    set((state) => {
      const current = state.bots[botId];
      if (!current) return state;
      const next: BotView = { ...current };
      if (patch.name !== undefined) next.name = patch.name;
      if (patch.portraitUrl !== undefined) next.portraitUrl = patch.portraitUrl;
      if (patch.characterId !== undefined) next.characterId = patch.characterId;
      if (patch.active !== undefined) next.active = patch.active;
      if (patch.sceneId !== undefined) next.sceneId = patch.sceneId;
      if (patch.archived !== undefined) next.archived = patch.archived;
      if (patch.data !== undefined) {
        next.data = mergeBotData(current.data, patch.data as Partial<BotProfileData>);
      }
      return { bots: { ...state.bots, [botId]: next } };
    }),

  beginSave: (botId) =>
    set((state) => ({
      pendingSaves: { ...state.pendingSaves, [botId]: (state.pendingSaves[botId] ?? 0) + 1 },
      saveStates: { ...state.saveStates, [botId]: 'saving' },
    })),

  endSave: (botId, serverView, ok) =>
    set((state) => {
      const pending = Math.max(0, (state.pendingSaves[botId] ?? 1) - 1);
      const next: Partial<BotStoreState> = {
        pendingSaves: { ...state.pendingSaves, [botId]: pending },
        saveStates: { ...state.saveStates, [botId]: ok ? 'saved' : 'error' },
      };
      if (ok && pending === 0 && serverView && botId in state.bots) {
        next.bots = { ...state.bots, [botId]: serverView };
      }
      return next;
    }),

  openEditor: (botId) =>
    set((state) => {
      if (!(botId in state.bots)) return state;
      return { openEditors: [...state.openEditors.filter((id) => id !== botId), botId] };
    }),

  closeEditor: (botId) =>
    set((state) => ({ openEditors: state.openEditors.filter((id) => id !== botId) })),

  focusEditor: (botId) => {
    if (get().openEditors.at(-1) === botId) return;
    set((state) => ({
      openEditors: [...state.openEditors.filter((id) => id !== botId), botId],
    }));
  },

  setTemplates: (templates) => set({ templates }),

  addUserTurn: (botId, text) =>
    set((state) => ({
      conversations: {
        ...state.conversations,
        [botId]: [...(state.conversations[botId] ?? []), { id: turnId(), role: 'user', text }],
      },
    })),

  startBotTurn: (botId, requestId) =>
    set((state) => ({
      pendingReplies: { ...state.pendingReplies, [botId]: requestId },
      conversations: {
        ...state.conversations,
        [botId]: [
          ...(state.conversations[botId] ?? []),
          { id: turnId(), role: 'bot', text: '', pending: true },
        ],
      },
    })),

  appendChunk: (botId, text, reset) =>
    set((state) => {
      const turns = state.conversations[botId];
      if (!turns) return state;
      return {
        conversations: {
          ...state.conversations,
          [botId]: patchLastBotTurn(turns, (turn) => ({
            ...turn,
            // A reset means the answer is being regenerated after a slip.
            text: reset ? '' : turn.text + text,
            ...(reset ? { retried: true } : {}),
          })),
        },
      };
    }),

  finishBotTurn: (reply) =>
    set((state) => {
      const turns = state.conversations[reply.botId];
      if (!turns) return state;
      const pendingReplies = { ...state.pendingReplies };
      delete pendingReplies[reply.botId];
      return {
        pendingReplies,
        conversations: {
          ...state.conversations,
          [reply.botId]: patchLastBotTurn(turns, (turn) => ({
            ...turn,
            text: reply.text,
            pending: false,
            retried: reply.retried,
            warning: reply.warning,
            usage: reply.usage,
          })),
        },
      };
    }),

  failBotTurn: (botId, error) =>
    set((state) => {
      const turns = state.conversations[botId];
      const pendingReplies = { ...state.pendingReplies };
      delete pendingReplies[botId];
      if (!turns) return { pendingReplies };
      return {
        pendingReplies,
        conversations: {
          ...state.conversations,
          [botId]: patchLastBotTurn(turns, (turn) => ({ ...turn, pending: false, error })),
        },
      };
    }),

  clearConversation: (botId) =>
    set((state) => ({ conversations: { ...state.conversations, [botId]: [] } })),
}));

let templatesRequested = false;

/** Loads the archetype library once per session (static, committed data). */
export function ensureBotTemplatesLoaded(): void {
  if (templatesRequested) return;
  templatesRequested = true;
  fetch('/public/bot-templates/index.json')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((raw) => useBotStore.getState().setTemplates(parseBotTemplates(raw)))
    .catch(() => {
      // Without templates the GM can still create a bot from scratch.
      templatesRequested = false;
    });
}
