import { create } from 'zustand';
import type { DiceSkinId } from '@vtt/shared';
import { DEFAULT_DICE_SKIN, isDiceSkinId } from '@vtt/shared';

/**
 * Ustawienia stołu widziane oczami jednego użytkownika (etap 27d).
 *
 * Wszystko poza skórką kości jest **prywatne i lokalne** — trzymane w tej
 * przeglądarce, nigdzie nie wysyłane. Skórka jest wyjątkiem, bo musi dojechać
 * do cudzych ekranów: przy stole widać kości **rzucającego**, więc jej jedyne
 * wiarygodne miejsce jest na serwerze (kolumna `User.diceSkin`). Tutaj leży
 * kopia, żeby okno ustawień miało co pokazać przed odpowiedzią serwera.
 *
 * Głośności są dwie, bo to dwie różne rzeczy: kości uderzają o stół
 * (biblioteka 3D), a kubek grzechocze w ręce (próbki odtwarzane u nas). Zero
 * wycisza jedno bez drugiego.
 */
export interface SettingsState {
  /** Wyłączone = rzut nie toczy kości, karta czatu pojawia się natychmiast. */
  animate: boolean;
  /** 0–100, uderzenia kości o stół. */
  diceVolume: number;
  /** 0–100, grzechot kubka podczas potrząsania. */
  cupVolume: number;
  /** Skórka TEGO użytkownika (kopia stanu serwera). */
  skin: DiceSkinId;
  /** Czy okno ustawień jest otwarte. */
  open: boolean;

  setAnimate: (animate: boolean) => void;
  setDiceVolume: (volume: number) => void;
  setCupVolume: (volume: number) => void;
  /** Ustawia kopię lokalną; wysyłką na serwer zajmuje się `socket.ts`. */
  applySkin: (skin: DiceSkinId) => void;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
}

const ANIMATE_KEY = 'vtt.dice.animate';
const DICE_VOLUME_KEY = 'vtt.dice.volume';
const CUP_VOLUME_KEY = 'vtt.cup.volume';
const SKIN_KEY = 'vtt.dice.skin';

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

function readVolume(key: string, fallback: number): number {
  try {
    // `getItem` gives null for „nigdy nie ustawione", a `Number(null)` to zero —
    // bez tego sprawdzenia każda świeża przeglądarka startowałaby wyciszona.
    const stored = window.localStorage.getItem(key);
    if (stored === null) return fallback;
    const raw = Number(stored);
    return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : fallback;
  } catch {
    return fallback;
  }
}

function readSkin(): DiceSkinId {
  try {
    const raw = window.localStorage.getItem(SKIN_KEY);
    return isDiceSkinId(raw) ? raw : DEFAULT_DICE_SKIN;
  } catch {
    return DEFAULT_DICE_SKIN;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Tryb prywatny: ustawienie po prostu nie przeżyje przeładowania.
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  animate: readFlag(ANIMATE_KEY, true),
  diceVolume: readVolume(DICE_VOLUME_KEY, 50),
  cupVolume: readVolume(CUP_VOLUME_KEY, 50),
  skin: readSkin(),
  open: false,

  setAnimate: (animate) => {
    write(ANIMATE_KEY, animate ? '1' : '0');
    set({ animate });
  },

  setDiceVolume: (volume) => {
    const clamped = Math.min(100, Math.max(0, Math.round(volume)));
    write(DICE_VOLUME_KEY, String(clamped));
    set({ diceVolume: clamped });
  },

  setCupVolume: (volume) => {
    const clamped = Math.min(100, Math.max(0, Math.round(volume)));
    write(CUP_VOLUME_KEY, String(clamped));
    set({ cupVolume: clamped });
  },

  applySkin: (skin) => {
    write(SKIN_KEY, skin);
    set({ skin });
  },

  setOpen: (open) => set({ open }),
  toggleOpen: () => set({ open: !get().open }),
}));
