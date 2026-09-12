import { create } from 'zustand';

/**
 * Wypowiedzi NPC-ów dopisujące się na czacie słowo po słowie.
 *
 * `revealed[messageId]` = ile pierwszych znaków tej linii jest widocznych.
 * Linia, której nie ma w mapie, renderuje się w całości — to pokrywa historię,
 * resynchronizację i wszystko, co nigdy nie było pisane na oczach stołu.
 *
 * Efekt jest wyłącznie wizualny i wyłącznie po stronie tej przeglądarki: serwer
 * dostarcza wypowiedź w całości, bez opóźniania danych.
 */
interface TypewriterStoreState {
  revealed: Record<number, number>;

  /** Linia zaczyna się pisać: najpierw pusta, potem rośnie. */
  start: (messageId: number) => void;
  setRevealed: (messageId: number, chars: number) => void;
  /** Koniec pisania — wpis znika, więc linia renderuje się już w całości. */
  finish: (messageId: number) => void;
  reset: () => void;
}

export const useTypewriterStore = create<TypewriterStoreState>((set) => ({
  revealed: {},

  start: (messageId) => set((state) => ({ revealed: { ...state.revealed, [messageId]: 0 } })),

  setRevealed: (messageId, chars) =>
    set((state) =>
      state.revealed[messageId] === chars || !(messageId in state.revealed)
        ? state
        : { revealed: { ...state.revealed, [messageId]: chars } },
    ),

  finish: (messageId) =>
    set((state) => {
      if (!(messageId in state.revealed)) return state;
      const next = { ...state.revealed };
      delete next[messageId];
      return { revealed: next };
    }),

  reset: () => set({ revealed: {} }),
}));
