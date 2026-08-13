import { create } from 'zustand';

/**
 * Tryb widzenia VTT: noc albo dzień (etap 27a).
 *
 * Ustawienie jest prywatne — trzymane w tej przeglądarce, nigdzie nie wysyłane
 * i nikomu nie broadcastowane. Nazwa trybu ląduje jako `data-theme` na elemencie
 * `<html>`, więc cały CSS może się do niego odwołać jednym selektorem.
 *
 * Na razie ubiera **wyłącznie kartę postaci** (`sheet.css`); reszta widoków
 * trzyma własne kolory do etapu 27, w którym motyw obejmie całą aplikację.
 * Dlatego domyślną wartością jest noc — VTT jest ciemne i taka karta pasuje do
 * niego bez zgrzytu.
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
    return window.localStorage.getItem(THEME_KEY) === 'day' ? 'day' : 'night';
  } catch {
    return 'night';
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
