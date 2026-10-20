import { create } from 'zustand';

/**
 * Tryb widzenia VTT: noc albo dzień (etap 27a).
 *
 * Ustawienie jest prywatne — trzymane w tej przeglądarce, nigdzie nie wysyłane
 * i nikomu nie broadcastowane. Nazwa trybu ląduje jako `data-theme` na elemencie
 * `<html>`, więc cały CSS może się do niego odwołać jednym selektorem.
 *
 * Domyślnie dzień (20.10.2026): nowy gracz bez zapisanego wyboru dostaje jasną
 * skórę, a noc zostaje dla tych, którzy wyłączą „Tryb dzienny” w ustawieniach.
 */
export type VttTheme = 'night' | 'day';

interface ThemeStoreState {
  theme: VttTheme;
  setTheme: (theme: VttTheme) => void;
  toggle: () => void;
}

const THEME_KEY = 'vtt.theme';

function readTheme(): VttTheme {
  try {
    return window.localStorage.getItem(THEME_KEY) === 'night' ? 'night' : 'day';
  } catch {
    return 'day';
  }
}

/** Jedyne miejsce, które dotyka DOM-u — store i atrybut nie mogą się rozjechać. */
function applyTheme(theme: VttTheme): void {
  document.documentElement.dataset.theme = theme;
}

const initialTheme = readTheme();
applyTheme(initialTheme);

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  theme: initialTheme,

  setTheme: (theme) => {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Tryb prywatny: ustawienie po prostu nie przeżyje przeładowania.
    }
    applyTheme(theme);
    set({ theme });
  },

  toggle: () => get().setTheme(get().theme === 'night' ? 'day' : 'night'),
}));
