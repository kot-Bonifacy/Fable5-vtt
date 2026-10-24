import { useMemo } from 'react';
import { create } from 'zustand';
import { ROLE_GM } from '@vtt/shared';
import {
  GM_DECISION_KINDS,
  gmAttentionItems,
  type GmAttentionItem,
  type GmAttentionSources,
  type GmAttentionTab,
} from '../gm-attention.js';
import { sessionReadinessIssues, type ReadinessIssue } from '../session-readiness.js';
import { useAuthStore } from './authStore.js';
import { useCampaignPlayersStore, type CampaignPlayer } from './campaignPlayersStore.js';
import { useCharacterStore } from './characterStore.js';
import { useChatStore } from './chatStore.js';
import { useCreationRankStore } from './creationRankStore.js';
import { usePortraitStore } from './portraitStore.js';
import { useSceneStore } from './sceneStore.js';

/**
 * „Czeka na MG” (25.09): co wyskoczyło jako kafel i dokąd MG właśnie idzie.
 *
 * Sama lista spraw nie mieszka tutaj — liczy ją `gmAttentionItems` z magazynów
 * źródłowych. Tu są tylko dwie rzeczy, których w nich nie ma: kafle świeżych
 * spraw (zapowiadane przez gniazdo, nie przez wczytanie stanu, żeby F5 nie
 * dzwoniło historią) i prośba „przejdź do sprawy” dla panelu bocznego.
 *
 * Od 24.10 sprawa z `GM_DECISION_KINDS` nie wyskakuje kaflem, tylko staje
 * w kolejce panelu decyzji (`decisions`). „✕” ją odkłada, nie odmawia: zostaje
 * na czacie i na liście, ale panel już sam jej nie pokaże.
 */
export type GmAttentionToast = GmAttentionItem & { at: number };

interface GmAttentionState {
  toasts: GmAttentionToast[];
  /** Klucze spraw czekających w panelu decyzji, w kolejności przyjścia. */
  decisions: string[];
  announce: (items: readonly GmAttentionItem[]) => void;
  dismiss: (key: string) => void;
  /** „✕” na panelu decyzji: sprawa schodzi z kolejki, ale dalej czeka. */
  setAside: (key: string) => void;
  /** Ostatnie „Przejdź”; `nonce` odróżnia drugie kliknięcie w tę samą sprawę. */
  focus: { key: string; tab: GmAttentionTab; nonce: number } | null;
  goTo: (item: GmAttentionItem) => void;
  clear: () => void;
}

export const useGmAttentionStore = create<GmAttentionState>((set) => ({
  toasts: [],
  decisions: [],
  announce: (items) =>
    set((state) => {
      const decided = items.filter((item) => GM_DECISION_KINDS.has(item.kind));
      const toasted = items.filter((item) => !GM_DECISION_KINDS.has(item.kind));
      // Sprawa, która wraca pod tym samym kluczem (gracz poprosił drugi raz),
      // wyskakuje od nowa, a nie dziedziczy czasu po poprzednim kaflu.
      const keys = new Set(toasted.map((item) => item.key));
      const queued = new Set(state.decisions);
      const at = Date.now();
      return {
        toasts: [
          ...state.toasts.filter((t) => !keys.has(t.key)),
          ...toasted.map((item) => ({ ...item, at })),
        ],
        decisions: [
          ...state.decisions,
          ...decided.map((item) => item.key).filter((key) => !queued.has(key)),
        ],
      };
    }),
  dismiss: (key) => set((state) => ({ toasts: state.toasts.filter((t) => t.key !== key) })),
  setAside: (key) => set((state) => ({ decisions: state.decisions.filter((k) => k !== key) })),
  focus: null,
  goTo: (item) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.key !== item.key),
      decisions: state.decisions.filter((k) => k !== item.key),
      focus: { key: item.key, tab: item.tab, nonce: (state.focus?.nonce ?? 0) + 1 },
    })),
  clear: () => set({ toasts: [], decisions: [], focus: null }),
}));

function sourcesNow(): GmAttentionSources {
  const characters = useCharacterStore.getState();
  const creation = useCreationRankStore.getState();
  const chat = useChatStore.getState();
  return {
    chat: chat.items,
    permits: creation.permits,
    ranks: creation.rows,
    characters: characters.order.flatMap((id) => characters.characters[id] ?? []),
    portraitWanted: usePortraitStore.getState().wanted,
    readiness: chat.campaign?.sessionStartedAt === null ? sessionReadinessNow() : [],
  };
}

/** Gracze kampanii bez konta MG przy tej karcie (MG bywa też członkiem własnej kampanii). */
function playersOf(players: readonly CampaignPlayer[], selfId: string | undefined) {
  return players.filter((player) => player.id !== selfId);
}

/**
 * Braki stołu przed sesją (15.10) w tej chwili — dla „Rozpocznij sesję”,
 * które pyta o nie w chwili kliknięcia, i dla `gmAttentionNow`.
 */
export function sessionReadinessNow(): ReadinessIssue[] {
  const characters = useCharacterStore.getState();
  return sessionReadinessIssues({
    scenes: useSceneStore.getState().scenes,
    players: playersOf(
      useCampaignPlayersStore.getState().players,
      useAuthStore.getState().user?.id,
    ),
    characters: characters.order.flatMap((id) => characters.characters[id] ?? []),
    permits: useCreationRankStore.getState().permits,
  });
}

/** To samo, co `sessionReadinessNow`, jako hook (MG; gracz nie ma listy scen ani graczy). */
export function useSessionReadiness(): ReadinessIssue[] {
  const selfId = useAuthStore((s) => s.user?.id);
  const scenes = useSceneStore((s) => s.scenes);
  const players = useCampaignPlayersStore((s) => s.players);
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const permits = useCreationRankStore((s) => s.permits);
  return useMemo(
    () =>
      sessionReadinessIssues({
        scenes,
        players: playersOf(players, selfId),
        characters: order.flatMap((id) => characters[id] ?? []),
        permits,
      }),
    [selfId, scenes, players, characters, order, permits],
  );
}

/** Sprawy MG w tej chwili — dla gniazda, które porównuje stan przed i po zdarzeniu. */
export function gmAttentionNow(): GmAttentionItem[] {
  return useAuthStore.getState().user?.role === ROLE_GM ? gmAttentionItems(sourcesNow()) : [];
}

/** To samo, co `gmAttentionNow`, jako hook; gracz dostaje zawsze pustą listę. */
export function useGmAttention(): GmAttentionItem[] {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const chat = useChatStore((s) => s.items);
  const permits = useCreationRankStore((s) => s.permits);
  const ranks = useCreationRankStore((s) => s.rows);
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const portraitWanted = usePortraitStore((s) => s.wanted);
  const preparing = useChatStore((s) => s.campaign?.sessionStartedAt === null);
  const readiness = useSessionReadiness();
  return useMemo(
    () =>
      isGm
        ? gmAttentionItems({
            chat,
            permits,
            ranks,
            characters: order.flatMap((id) => characters[id] ?? []),
            portraitWanted,
            readiness: preparing ? readiness : [],
          })
        : [],
    [isGm, chat, permits, ranks, characters, order, portraitWanted, preparing, readiness],
  );
}
