import { create } from 'zustand';
import type { ChatCategory } from '@vtt/shared';

/**
 * Co widać na czacie (01.09.2026).
 *
 * Ustawienie jest **prywatne i lokalne**, jak głośności z etapu 27d: filtr
 * niczego nie zmienia w tym, co serwer przysłał — decyduje wyłącznie o tym, co
 * ten jeden ekran rysuje. Dlatego mieszka w `localStorage`, nie w bazie, i nie
 * ma go w żadnym zdarzeniu Socket.IO.
 *
 * Wyłączona kategoria **nie kasuje wierszy** — zwija je w klikalny separator
 * („⋯ 4 ukryte wiersze ⋯"), bo czat jest logiem sesji i nic z niego nie powinno
 * znikać bez śladu.
 */
export interface ChatFilterState {
  /** Które grupy są rysowane. */
  categories: Record<ChatCategory, boolean>;
  /**
   * Przycisk „Ja” (etap 60a): zwija dodatkowo wszystko, co patrzącego nie
   * dotyczy (`chatInvolvement` daje `null`). Działa **razem** z kategoriami,
   * nie zamiast nich — „Ja” przy zgaszonych „Rzutach” to moje rozmowy i sprawy.
   */
  mineOnly: boolean;

  toggleCategory: (category: ChatCategory) => void;
  setCategory: (category: ChatCategory, on: boolean) => void;
  toggleMineOnly: () => void;
}

const CATEGORIES_KEY = 'vtt.chat.categories';
/** Osobny klucz: zapis kategorii czyta się klucz po kluczu i obcego by nie przyjął. */
const MINE_ONLY_KEY = 'vtt.chat.mineOnly';

const ALL_ON: Record<ChatCategory, boolean> = { talk: true, dice: true, combat: true, table: true };

function readCategories(): Record<ChatCategory, boolean> {
  try {
    const raw = window.localStorage.getItem(CATEGORIES_KEY);
    if (raw === null) return { ...ALL_ON };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...ALL_ON };
    const stored = parsed as Record<string, unknown>;
    // Klucz po kluczu, nie `{...ALL_ON, ...parsed}`: zapis z przyszłej wersji
    // (albo ręcznie podmieniony) nie ma jak dołożyć kategorii, której kod nie zna.
    const result = { ...ALL_ON };
    for (const key of Object.keys(ALL_ON) as ChatCategory[]) {
      if (typeof stored[key] === 'boolean') result[key] = stored[key];
    }
    return result;
  } catch {
    return { ...ALL_ON };
  }
}

function persistCategories(categories: Record<ChatCategory, boolean>): void {
  try {
    window.localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  } catch {
    // Tryb prywatny: ustawienie po prostu nie przeżyje przeładowania.
  }
}

function readMineOnly(): boolean {
  try {
    return window.localStorage.getItem(MINE_ONLY_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistMineOnly(on: boolean): void {
  try {
    window.localStorage.setItem(MINE_ONLY_KEY, String(on));
  } catch {
    // Tryb prywatny — jak wyżej.
  }
}

export const useChatFilterStore = create<ChatFilterState>((set, get) => ({
  categories: readCategories(),
  mineOnly: readMineOnly(),

  toggleCategory: (category) => {
    const categories = { ...get().categories, [category]: !get().categories[category] };
    persistCategories(categories);
    set({ categories });
  },

  setCategory: (category, on) => {
    const categories = { ...get().categories, [category]: on };
    persistCategories(categories);
    set({ categories });
  },

  toggleMineOnly: () => {
    const mineOnly = !get().mineOnly;
    persistMineOnly(mineOnly);
    set({ mineOnly });
  },
}));
