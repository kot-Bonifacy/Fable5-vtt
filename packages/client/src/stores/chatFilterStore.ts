import { create } from 'zustand';
import type { ChatCategory } from '@vtt/shared';

/**
 * Co widać na czacie i jak gęsto (01.09.2026).
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
  /** Które grupy są rysowane w całości. */
  categories: Record<ChatCategory, boolean>;
  /**
   * Tryb zwarty: karty mechaniczne kurczą się do jednej linii, wypowiedzi
   * zostają w całości (rozmowy czyta się, a nie przegląda).
   */
  compact: boolean;

  toggleCategory: (category: ChatCategory) => void;
  setCategory: (category: ChatCategory, on: boolean) => void;
  /** „Pokaż wszystko" — jeden klik z powrotem do pełnego logu. */
  showAll: () => void;
  /**
   * Zostawia włączoną wyłącznie tę jedną grupę (Alt+klik w pasku filtrów).
   * „Same rozmowy" to trzy kliknięcia albo jedno — a sięga się po nie najczęściej.
   */
  soloCategory: (category: ChatCategory) => void;
  setCompact: (compact: boolean) => void;
  toggleCompact: () => void;
}

const CATEGORIES_KEY = 'vtt.chat.categories';
const COMPACT_KEY = 'vtt.chat.compact';

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

function readCompact(): boolean {
  try {
    return window.localStorage.getItem(COMPACT_KEY) === '1';
  } catch {
    return false;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Tryb prywatny: ustawienie po prostu nie przeżyje przeładowania.
  }
}

function persistCategories(categories: Record<ChatCategory, boolean>): void {
  write(CATEGORIES_KEY, JSON.stringify(categories));
}

export const useChatFilterStore = create<ChatFilterState>((set, get) => ({
  categories: readCategories(),
  compact: readCompact(),

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

  showAll: () => {
    persistCategories(ALL_ON);
    set({ categories: { ...ALL_ON } });
  },

  soloCategory: (category) => {
    const categories = { talk: false, dice: false, combat: false, table: false, [category]: true };
    persistCategories(categories);
    set({ categories });
  },

  setCompact: (compact) => {
    write(COMPACT_KEY, compact ? '1' : '0');
    set({ compact });
  },

  toggleCompact: () => get().setCompact(!get().compact),
}));
